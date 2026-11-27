import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  toPublicError,
  type PublicError,
} from "@/kernel/errors";
import { isServiceError } from "@/modules/publications";

/**
 * The one place a thrown value becomes an HTTP response for WP3b routes.
 *
 * Every failure that reaches a browser goes through `jsonError`, so a database
 * error, a stack trace, a constraint name or a parameterised query cannot leak:
 * the body is built from the kernel's closed vocabulary (`toPublicError`) plus,
 * for a service CONFLICT, the draft snapshot the service deliberately chose to
 * expose so the editor can reload. Nothing else is copied from the error.
 *
 * The mapping WP3b owns (the gap WP3a left open):
 *   ServiceError.FORBIDDEN  -> 403 (kernel ForbiddenError)
 *   ServiceError.CONFLICT   -> 409 (kernel ConflictError) + service details
 *   ServiceError.NOT_FOUND  -> 404 (kernel NotFoundError)
 *   ServiceError.VALIDATION -> 400 (kernel ValidationError)
 *   UnauthorizedError       -> 401 (this file; no kernel code exists for it)
 *   anything else           -> toPublicError (INTERNAL / UNAVAILABLE), no leak
 */

/**
 * A request the boundary refuses before any service runs (no session).
 *
 * The message is a fixed constant, not text from the thrown value: even though
 * the only producer is this module, the HTTP boundary never renders an error's
 * own message. (The disclosure source rule enforces exactly this.)
 */
const UNAUTHORIZED_MESSAGE = "Sign in to continue";

export class UnauthorizedError extends Error {
  constructor() {
    super(UNAUTHORIZED_MESSAGE);
    this.name = "UnauthorizedError";
  }
}

const NO_STORE = { "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;

function respond(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

/** The public error body, with the conflict snapshot attached only for 409. */
function publicBody(publicError: PublicError, details?: Record<string, unknown>): Record<string, unknown> {
  if (details !== undefined) return { ...publicError, details };
  return { ...publicError };
}

/**
 * Map any thrown value to a response. `requestId` is the id the caller logs and
 * the user can quote; it is reused from the request header when present.
 */
export function jsonError(error: unknown, requestId: string): Response {
  if (error instanceof UnauthorizedError) {
    return respond({ code: "UNAUTHORIZED", message: UNAUTHORIZED_MESSAGE, requestId }, 401);
  }

  // A refused request caused by volume carries the one number a client needs to
  // recover. The body stays in the kernel's public vocabulary.
  if (error instanceof RateLimitError) {
    return respond(toPublicError(error, requestId), 429, {
      "retry-after": String(error.retryAfterSeconds),
    });
  }

  if (isServiceError(error)) {
    switch (error.code) {
      case "FORBIDDEN":
        return respond(publicBody(toPublicError(new ForbiddenError(error.message), requestId)), 403);
      case "CONFLICT":
        return respond(
          publicBody(toPublicError(new ConflictError(error.message), requestId), error.details),
          409,
        );
      case "NOT_FOUND":
        return respond(publicBody(toPublicError(new NotFoundError(), requestId)), 404);
      case "VALIDATION":
        return respond(publicBody(toPublicError(new ValidationError(error.message), requestId)), 400);
    }
  }

  // Everything else — a driver error, a bug, a network failure — becomes the
  // kernel's INTERNAL/UNAVAILABLE with a fixed message. The raw error is never
  // read into the body.
  const mapped = toPublicError(error, requestId);
  return respond(publicBody(mapped), mapped.status);
}

/** Read the request id from the header, or mint one. Bounded by the kernel. */
export function requestIdFrom(headers: Headers): string {
  const supplied = headers.get("x-request-id");
  if (supplied !== null && supplied.length >= 1 && supplied.length <= 64) return supplied;
  return crypto.randomUUID();
}