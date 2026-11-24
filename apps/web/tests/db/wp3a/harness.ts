import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Shared harness for the WP3a database suites.
 *
 * Each suite owns a schema named `wp3a_test_<suite>` and applies the committed
 * migration to it. That gives two things a mock cannot: the real constraints,
 * and isolation from the WP1 suite, which drops and recreates `public`.
 *
 * The migration SQL is the project's, not a hand copy: a service that only
 * works against DDL written in a test proves nothing about production.
 */

const DRIZZLE_DIR = fileURLToPath(new URL("../../../drizzle/", import.meta.url));

export const DATABASE_URL = process.env.DATABASE_URL;

/** CI must never silently skip these suites. `REQUIRE_DB` is the brief's name;
 * `REQUIRE_DATABASE` is the repo's existing one. Both are honoured. */
export const REQUIRED =
  process.env.CI === "true" ||
  process.env.REQUIRE_DATABASE === "1" ||
  process.env.REQUIRE_DB === "1";

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

export type TestDatabase = {
  readonly schema: string;
  readonly pool: Pool;
  readonly db: NodePgDatabase;
  /** A second pool, so a test can hold a transaction open on one connection
   * while another call contends on a different one. */
  extraPool(max?: number): Pool;
  close(): Promise<void>;
};

export async function createTestDatabase(suite: string): Promise<TestDatabase> {
  if (DATABASE_URL === undefined || DATABASE_URL === "") {
    throw new Error("createTestDatabase needs DATABASE_URL");
  }
  const schema = `wp3a_test_${suite}`;

  const admin = new Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 12,
    options: `-c search_path=${schema}`,
  });

  // Drizzle writes the foreign keys as `REFERENCES "public"."users"`. The
  // tables themselves are unqualified, so `search_path` moves them, but a
  // literal `public.` would pin every foreign key back at production-era
  // tables. Relocate that qualifier — nothing else — so the suite proves the
  // migration's own columns, checks, indexes and constraint shapes.
  for (const statement of migrationStatements()) {
    await pool.query(statement.replace(/"public"\./g, `"${schema}".`));
  }

  // The relocation is verified, not assumed: no foreign key in this schema may
  // point outside it.
  const escaped = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace tn ON tn.oid = t.relnamespace
       JOIN pg_class r ON r.oid = c.confrelid
       JOIN pg_namespace rn ON rn.oid = r.relnamespace
      WHERE c.contype = 'f' AND tn.nspname = $1 AND rn.nspname <> $1`,
    [schema],
  );
  if (Number(escaped.rows[0]?.n ?? "0") !== 0) {
    throw new Error(`Migration foreign keys escaped the ${schema} schema`);
  }

  const extra: Pool[] = [];
  return {
    schema,
    pool,
    db: drizzle(pool),
    extraPool(max = 12) {
      const created = new Pool({
        connectionString: DATABASE_URL,
        max,
        options: `-c search_path=${schema}`,
      });
      extra.push(created);
      return created;
    },
    async close() {
      for (const created of extra) await created.end();
      await pool.end();
    },
  };
}

/** A start barrier: every caller waits until `n` have arrived, so the calls
 * below it begin together instead of drifting in one at a time. */
export function barrier(n: number): () => Promise<void> {
  let arrived = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived === n) release?.();
    await gate;
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Counts rows with a parameterised WHERE, for invariant assertions. */
export async function count(
  pool: Pool,
  table: string,
  where = "",
  params: unknown[] = [],
): Promise<number> {
  const result = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM "${table}" ${where}`,
    params,
  );
  return Number(result.rows[0]!.n);
}
