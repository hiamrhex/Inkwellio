import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getPool } from "../../src/kernel/db";
import * as schema from "../../src/modules/identity/schema";

const DATABASE_URL = process.env.DATABASE_URL;
const RUN_DB_TESTS = Boolean(DATABASE_URL);

const DRIZZLE_DIR = fileURLToPath(new URL("../../drizzle/", import.meta.url));

type Journal = { entries: Array<{ tag: string }> };

function migrationStatements(): string[] {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8"),
  ) as Journal;
  return journal.entries.flatMap((entry) =>
    readFileSync(join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0),
  );
}

describe("Finding A: Better Auth schema & migrations", () => {
  describe("static schema exports", () => {
    it("exports all required Better Auth tables with usePlural naming", () => {
      // Must export users, sessions, accounts, verifications, rateLimits
      expect((schema as Record<string, unknown>).users).toBeDefined();
      expect((schema as Record<string, unknown>).sessions).toBeDefined();
      expect((schema as Record<string, unknown>).accounts).toBeDefined();
      expect((schema as Record<string, unknown>).verifications).toBeDefined();
      expect((schema as Record<string, unknown>).rateLimits).toBeDefined();
    });

    it("includes name, email_verified, and image on users table", () => {
      const usersTable = (schema as Record<string, unknown>).users as {
        name: unknown;
        emailVerified: unknown;
        image: unknown;
      };
      expect(usersTable.name).toBeDefined();
      expect(usersTable.emailVerified).toBeDefined();
      expect(usersTable.image).toBeDefined();
    });
  });

  describe("live postgres migration & cascade", () => {
    let pool: Pool | null = null;

    beforeAll(async () => {
      if (RUN_DB_TESTS) {
        pool = getPool();
        await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
        await pool.query("CREATE SCHEMA public");
        for (const statement of migrationStatements()) {
          await pool.query(statement);
        }
      }
    });

    afterAll(async () => {
      if (pool) {
        await closeDb();
      }
    });

    it.skipIf(!RUN_DB_TESTS)("applies migrations and creates all required tables", async () => {
      const result = await pool!.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      const tables = new Set(result.rows.map((r) => r.table_name));

      expect(tables.has("users")).toBe(true);
      expect(tables.has("sessions")).toBe(true);
      expect(tables.has("accounts")).toBe(true);
      expect(tables.has("verifications")).toBe(true);
      expect(tables.has("rate_limits")).toBe(true);
    });

    it.skipIf(!RUN_DB_TESTS)("preserves email lowercase CHECK constraint and unique index", async () => {
      // 1. Unique constraint
      await pool!.query(
        "INSERT INTO users (id, email, name) VALUES (gen_random_uuid(), 'test-unique@example.com', 'Test')",
      );
      await expect(
        pool!.query(
          "INSERT INTO users (id, email, name) VALUES (gen_random_uuid(), 'test-unique@example.com', 'Test 2')",
        ),
      ).rejects.toMatchObject({ code: "23505" }); // unique_violation

      // 2. Lowercase check
      await expect(
        pool!.query(
          "INSERT INTO users (id, email, name) VALUES (gen_random_uuid(), 'UPPER@example.com', 'Test')",
        ),
      ).rejects.toMatchObject({ code: "23514" }); // check_violation
    });

    it.skipIf(!RUN_DB_TESTS)("cascades deletion from users to sessions and accounts", async () => {
      const userRes = await pool!.query<{ id: string }>(
        "INSERT INTO users (id, email, name) VALUES (gen_random_uuid(), 'cascade@example.com', 'Cascade') RETURNING id",
      );
      const userId = userRes.rows[0]!.id;

      await pool!.query(
        "INSERT INTO sessions (id, user_id, token, expires_at) VALUES ('s1', $1, 'tok1', now() + interval '1 day')",
        [userId],
      );
      await pool!.query(
        "INSERT INTO accounts (id, user_id, account_id, provider_id) VALUES ('a1', $1, 'acc1', 'credential')",
        [userId],
      );

      // Delete user
      await pool!.query("DELETE FROM users WHERE id = $1", [userId]);

      // Assert sessions and accounts rows cascaded
      const sRes = await pool!.query("SELECT id FROM sessions WHERE user_id = $1", [userId]);
      const aRes = await pool!.query("SELECT id FROM accounts WHERE user_id = $1", [userId]);
      expect(sRes.rows.length).toBe(0);
      expect(aRes.rows.length).toBe(0);
    });
  });
});
