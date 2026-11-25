import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { seedTopics as seedTopicsFn } from "../src/modules/topics";

type SeedExecutor = Parameters<typeof seedTopicsFn>[0];
type SeedResult = Awaited<ReturnType<typeof seedTopicsFn>>;

export interface PoolLike {
  end: () => Promise<void>;
}

export interface RunSeedTopicsOptions {
  env?: Record<string, string | undefined>;
  createPool?: (connectionString: string) => PoolLike;
  createDb?: (pool: PoolLike) => unknown;
  seedFn?: (executor: SeedExecutor) => Promise<SeedResult>;
  log?: (line: string) => void;
}

const URL_CREDENTIALS_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi;

/**
 * Strips any URL (and embedded credentials or hosts) before writing error
 * messages to logs or stderr.
 */
export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(URL_CREDENTIALS_PATTERN, "[REDACTED_URL]");
}

/**
 * Resolves the Postgres connection string for CLI topic seeding, preferring
 * `DATABASE_URL_UNPOOLED` and falling back to `DATABASE_URL`. Fails closed
 * without printing secret values.
 */
export function resolveSeedDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const unpooled = env.DATABASE_URL_UNPOOLED?.trim();
  const pooled = env.DATABASE_URL?.trim();
  const selected = unpooled || pooled;

  if (!selected) {
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set");
  }

  let parsed: URL;
  try {
    parsed = new URL(selected);
  } catch {
    throw new Error("Database URL must use postgres:// or postgresql:// scheme");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Database URL must use postgres:// or postgresql:// scheme");
  }

  return selected;
}

async function loadSeedTopicsFn(): Promise<typeof seedTopicsFn> {
  // Offline seed runs may provide only DATABASE_URL / DATABASE_URL_UNPOOLED
  // without Better Auth web runtime secrets; defer kernel/env eager parse.
  const prevNextPhase = process.env.NEXT_PHASE;
  if (!prevNextPhase) {
    process.env.NEXT_PHASE = "phase-production-build";
  }
  try {
    const mod = await import("../src/modules/topics");
    return mod.seedTopics;
  } finally {
    if (prevNextPhase === undefined) {
      delete process.env.NEXT_PHASE;
    } else {
      process.env.NEXT_PHASE = prevNextPhase;
    }
  }
}

/**
 * Executes idempotent topic seeding against the configured database and closes
 * the short-lived pool cleanly.
 */
export async function runSeedTopics(
  options: RunSeedTopicsOptions = {},
): Promise<number> {
  const env = options.env ?? process.env;
  const connectionString = resolveSeedDatabaseUrl(env);
  const createPool =
    options.createPool ??
    ((url: string) =>
      new Pool({
        connectionString: url,
        max: 2,
        connectionTimeoutMillis: 5_000,
      }));
  const createDb =
    options.createDb ?? ((pool: PoolLike) => drizzle(pool as Pool));
  const seedFn = options.seedFn ?? (await loadSeedTopicsFn());
  const log =
    options.log ?? ((line: string) => process.stdout.write(`${line}\n`));

  const pool = createPool(connectionString);
  try {
    const db = createDb(pool) as Extract<SeedExecutor, { kind: "db" }>["db"];
    const seeded = await seedFn({ kind: "db", db });
    log(`[seed-topics] ensured ${seeded.length} topics`);
    return seeded.length;
  } catch (error) {
    throw new Error(sanitizeErrorMessage(error));
  } finally {
    await pool.end();
  }
}

function isDirectCliExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
}

if (isDirectCliExecution()) {
  runSeedTopics().catch((error: unknown) => {
    process.stderr.write(`[seed-topics] error: ${sanitizeErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
