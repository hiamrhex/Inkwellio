import { requireVersion } from "./body";

/**
 * The body every lifecycle action shares: the compare-and-set token. The
 * idempotency key is the `x-request-id` header (see `requestIdFrom`), not a body
 * field, so a retried request reuses the same key and the service answers it
 * from its audit row.
 */
export function requireExpectedVersion(body: Record<string, unknown>): number {
  return requireVersion(body, "expectedVersion");
}