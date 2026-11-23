import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const DRIZZLE_DIR = fileURLToPath(new URL("../drizzle/", import.meta.url));

/**
 * Create the schema once, before any test file runs.
 *
 * Every DB test shares one database. Previously only the WP1 suite created the
 * schema, so any file that ran first hit `relation "users" does not exist`
 * (CI: sign-up.test.ts). Applying the committed migrations here makes the suite
 * independent of file order and of what a previous run left behind.
 *
 * Without `DATABASE_URL` there is nothing to prepare: the DB suites skip
 * themselves rather than falling back to an in-memory fake.
 */
export default async function setup(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");

    type Journal = { entries: Array<{ tag: string }> };
    const journal = JSON.parse(
      readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8"),
    ) as Journal;

    for (const entry of journal.entries) {
      const migration = readFileSync(join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8");
      for (const statement of migration.split("--> statement-breakpoint")) {
        const trimmed = statement.trim();
        if (trimmed.length > 0) await client.query(trimmed);
      }
    }
  } finally {
    await client.end();
  }
}
