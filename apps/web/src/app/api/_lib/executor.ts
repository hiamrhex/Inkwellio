import { getDb } from "@/kernel/db";
import type { Executor } from "@/modules/publications";

/**
 * The default executor for a route: the process-wide Drizzle handle from
 * `kernel/db`. A single statement is already atomic; a service that needs a
 * transaction opens one itself via `runInTransaction`.
 */
export function dbExecutor(): Executor {
  return { kind: "db", db: getDb() };
}