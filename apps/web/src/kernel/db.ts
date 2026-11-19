import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The one database entry point. Kept lazy on purpose: `next build` imports every
 * module (including this one) but must not need a database, and a process that
 * only serves static assets should never open a socket.
 *
 * Budgets (A9): a connection attempt gives up after 10 s and any single
 * statement after 30 s. A hung query is worse than an error because it holds a
 * Vercel function open until the platform kills it.
 */
const CONNECTION_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 30_000;
/** Neon's free tier has a small connection ceiling; serverless instances each
 * own a pool, so a large `max` multiplies rather than helps. */
const POOL_MAX = 5;

let pool: Pool | undefined;
let database: NodePgDatabase | undefined;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error(
      "DATABASE_URL is not set. Point it at a Postgres 17 database (see .env.example) before using the database.",
    );
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error("DATABASE_URL must be a postgres:// or postgresql:// URL.");
  }
  return url;
}

export function getPool(): Pool {
  pool ??= new Pool({
    connectionString: connectionString(),
    max: POOL_MAX,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 30_000,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  });
  return pool;
}

export function getDb(): NodePgDatabase {
  database ??= drizzle(getPool());
  return database;
}

/**
 * Closes the pool and forgets it, so a later `getDb()` starts clean. Tests and
 * the eventual erasure job need this; request handlers never call it.
 */
export async function closeDb(): Promise<void> {
  const current = pool;
  pool = undefined;
  database = undefined;
  if (current !== undefined) {
    await current.end();
  }
}
