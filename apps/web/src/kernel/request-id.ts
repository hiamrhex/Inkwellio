/**
 * Kernel: request identifiers.
 *
 * Kept in its own module so `kernel/errors.ts` stays free of Node built-ins and
 * can be imported by a Client Component that only needs the public vocabulary.
 *
 * Web Crypto's `randomUUID` is available on Node 20+ and in the edge runtime,
 * so this file is safe in either.
 */
export function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}
