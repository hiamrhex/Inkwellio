import { ValidationError } from "@/kernel/errors";

/**
 * Read a JSON request body, failing as a 400 VALIDATION (via the kernel
 * `ValidationError`) for anything that is not a JSON object. The raw parse
 * error is never surfaced: a malformed body is the client's mistake, reported
 * with the kernel's fixed message, not a stack trace.
 */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ValidationError("A JSON body is required");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError("A JSON object body is required");
  }
  return parsed as Record<string, unknown>;
}

/** A required string field, bounded and trimmed of nothing (the service
 *  validators own content rules; this only proves presence and type). */
export function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string") throw new ValidationError(`${field} is required`);
  return value;
}

/** An optional string field; `undefined` when absent, validated when present. */
export function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ValidationError(`${field} must be a string`);
  return value;
}

/** A required non-negative integer field (the CAS `expectedVersion`). */
export function requireVersion(body: Record<string, unknown>, field = "expectedVersion"): number {
  const value = body[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${field} must be a non-negative integer`);
  }
  return value;
}