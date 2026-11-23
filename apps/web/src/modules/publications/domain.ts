import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Shared domain primitives for the publication/post services.
 *
 * They live in `publications` because the dependency direction is posts ->
 * publications (the posts schema already imports the publications table), and
 * the seam rules forbid a cycle. Anything posts needs from here is re-exported
 * through the posts module so callers never reach across a module boundary.
 */

/** The acting user, or `null` for an anonymous request. */
export type Actor = { readonly userId: string } | null;

export type ServiceErrorCode = "CONFLICT" | "NOT_FOUND" | "VALIDATION" | "FORBIDDEN";

/**
 * A failure the service layer chose, with a code the HTTP boundary can map.
 * The kernel's `AppError` has no FORBIDDEN today; mapping is WP3b's job.
 */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: ServiceErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.details = details;
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

export function conflict(message = "Conflict", details?: Record<string, unknown>): ServiceError {
  return new ServiceError("CONFLICT", message, details);
}

/** Deliberately takes no arguments: a missing post and a post the caller may
 * not see must be indistinguishable, so there is nothing to vary. */
export function notFound(): ServiceError {
  return new ServiceError("NOT_FOUND", "Not found");
}

export function validation(message = "Invalid input"): ServiceError {
  return new ServiceError("VALIDATION", message);
}

export function forbidden(message = "Forbidden"): ServiceError {
  return new ServiceError("FORBIDDEN", message);
}

export function requireActor(actor: Actor): { readonly userId: string } {
  if (actor === null) throw forbidden("Sign in to continue");
  return actor;
}

/** The subset of a Drizzle database the services use. Raw SQL keeps the
 * compare-and-set, locking and `ON CONFLICT` clauses explicit. */
export type Queryable = { execute(query: SQL): Promise<unknown> };
export type Db = NodePgDatabase;
export type Executor = { kind: "db"; db: Db } | { kind: "tx"; tx: Queryable };

/** Unwrap without opening a transaction: a single statement is already atomic. */
export function queryable(executor: Executor): Queryable {
  return executor.kind === "tx" ? executor.tx : executor.db;
}

/**
 * Run `fn` in one interactive transaction. If the caller already holds one, it
 * is joined rather than nested — a nested `BEGIN` would be a different
 * transaction, and the caller's locks and audit row would not roll back with it.
 */
export async function runInTransaction<T>(
  executor: Executor,
  fn: (q: Queryable) => Promise<T>,
): Promise<T> {
  if (executor.kind === "tx") return fn(executor.tx);
  return executor.db.transaction((tx) => fn(tx));
}

export async function rows<T>(q: Queryable, query: SQL): Promise<T[]> {
  const result = await q.execute(query);
  const value = (result as { rows?: unknown }).rows;
  if (!Array.isArray(value)) {
    throw new Error("The database driver returned no rows array");
  }
  return value as T[];
}

export async function row<T>(q: Queryable, query: SQL): Promise<T | undefined> {
  const found = await rows<T>(q, query);
  return found[0];
}

/** Postgres SQLSTATE of a thrown driver error, when it has one. */
export function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = (error as { code?: unknown }).code;
  return typeof candidate === "string" ? candidate : undefined;
}

/** Bigint columns come back as strings from node-postgres. */
export function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Expected a numeric column");
  return parsed;
}

export { sql };
