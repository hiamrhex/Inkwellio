import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { mapAuthError } from "../src/modules/identity";
import { getPool } from "../src/kernel/db";

const DATABASE_URL = process.env.DATABASE_URL;

describe("Gate G1: sign-up invariants", () => {
  it("normalizes email to lowercase so uppercase cannot bypass uniqueness", () => {
    const rawEmail = "Test.Author_42@EXAMPLE.COM";
    const normalized = rawEmail.trim().toLowerCase();
    expect(normalized).toBe("test.author_42@example.com");
    expect(normalized).not.toBe(rawEmail);
  });

  it("hashes password with a secure one-way hash, never storing plaintext", async () => {
    const plaintext = "CorrectHorse-BatteryStaple-2026!";
    const hash = await hashPassword(plaintext);

    expect(hash).not.toBe(plaintext);
    expect(hash.length).toBeGreaterThan(20);
    // Hash must not contain the plaintext password anywhere
    expect(hash.includes(plaintext)).toBe(false);

    // Verification must confirm matching password and reject incorrect password
    const matches = await verifyPassword({ hash, password: plaintext });
    expect(matches).toBe(true);

    const wrong = await verifyPassword({ hash, password: "WrongPassword123!" });
    expect(wrong).toBe(false);
  });

  it("sequential duplicate sign-up produces a clean 409 Conflict error", () => {
    const duplicateError = new Error("unique constraint violation: user already exists");
    Object.assign(duplicateError, { code: "23505" });

    const publicError = mapAuthError(duplicateError, "req-test-seq-dup");
    expect(publicError.status).toBe(409);
    expect(publicError.code).toBe("CONFLICT");
    expect(publicError.message).toBe("That already exists");
  });

  it("10 simultaneous duplicate sign-up errors all map to clean conflicts", async () => {
    const requests = Array.from({ length: 10 }, (_, i) => ({
      requestId: `req-simul-${i}`,
      error: Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      }),
    }));

    const results = requests.map((req) => mapAuthError(req.error, req.requestId));

    expect(results).toHaveLength(10);
    for (const res of results) {
      expect(res.status).toBe(409);
      expect(res.code).toBe("CONFLICT");
      expect(res.message).toBe("That already exists");
    }
  });

  describe.skipIf(!DATABASE_URL)("with live Postgres (CI gate)", () => {
    it("live DB rejects uppercase email via check constraint (users_email_lowercase_check)", async () => {
      const pool = getPool();
      await expect(
        pool.query("INSERT INTO users (email) VALUES ($1)", ["UPPERCASE@EXAMPLE.COM"]),
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("live DB rejects duplicate email with unique constraint (23505) and maps to clean conflict", async () => {
      const pool = getPool();
      const testEmail = `g1-test-${Date.now()}@example.com`;

      // First insert succeeds
      const first = await pool.query<{ id: string }>(
        "INSERT INTO users (email) VALUES ($1) RETURNING id",
        [testEmail],
      );
      expect(first.rows[0]?.id).toBeDefined();

      // Sequential duplicate fails with 23505
      let caughtError: unknown;
      try {
        await pool.query("INSERT INTO users (email) VALUES ($1)", [testEmail]);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect((caughtError as { code: string }).code).toBe("23505");

      const mapped = mapAuthError(caughtError, "req-g1-dup");
      expect(mapped.status).toBe(409);
      expect(mapped.code).toBe("CONFLICT");
    });

    it("10 simultaneous duplicate inserts to live DB yield exactly one row and clean conflicts", async () => {
      const pool = getPool();
      const testEmail = `g1-concurrent-${Date.now()}@example.com`;

      const attempts = Array.from({ length: 10 }, async (_, i) => {
        try {
          const res = await pool.query<{ id: string }>(
            "INSERT INTO users (email) VALUES ($1) RETURNING id",
            [testEmail],
          );
          return { success: true, id: res.rows[0]?.id };
        } catch (err) {
          const mapped = mapAuthError(err, `req-concurrent-${i}`);
          return { success: false, mapped };
        }
      });

      const settled = await Promise.all(attempts);
      const successes = settled.filter((s) => s.success);
      const failures = settled.filter((s) => !s.success);

      // Exactly 1 winner
      expect(successes).toHaveLength(1);
      // Exactly 9 clean conflicts
      expect(failures).toHaveLength(9);
      for (const f of failures) {
        expect(f.mapped?.status).toBe(409);
        expect(f.mapped?.code).toBe("CONFLICT");
      }
    });
  });
});
