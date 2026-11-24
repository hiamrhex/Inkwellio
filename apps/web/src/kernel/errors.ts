/**
 * Kernel: the public error vocabulary.
 *
 * Every failure that reaches a browser passes through `toPublicError`. The
 * public result has a closed set of codes and a fixed message per code, so a
 * database error, a stack trace, a constraint name or a parameterised query
 * cannot travel to the client by accident — the only strings that can are the
 * ones written in this file and the ones this repository chose to throw
 * (`AppError` and its subclasses).
 *
 * Raw errors are not discarded. A caller logs them with `kernel/log.ts` beside
 * the returned `requestId`, which is how an incident is traced without telling
 * the person who hit the error anything.
 */
/** The complete set. A code outside this union is not renderable. */
export type PublicErrorCode =
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "INTERNAL";

type PublicDefinition = {
  readonly status: number;
  readonly message: string;
};

const PUBLIC_ERRORS: Record<PublicErrorCode, PublicDefinition> = {
  VALIDATION_ERROR: { status: 400, message: "Invalid input" },
  FORBIDDEN: { status: 403, message: "Forbidden" },
  NOT_FOUND: { status: 404, message: "Not found" },
  CONFLICT: { status: 409, message: "That already exists" },
  UNAVAILABLE: { status: 503, message: "Temporarily unavailable" },
  INTERNAL: { status: 500, message: "Something went wrong" },
};

export type PublicError = PublicDefinition & {
  readonly code: PublicErrorCode;
  readonly requestId: string;
};

/**
 * Postgres SQLSTATEs worth distinguishing, and nothing else.
 *
 * The rest — a missing column, a syntax error, a dropped table — are bugs, not
 * user mistakes, and they become `INTERNAL`. Mapping them to 4xx would hide a
 * deploy fault behind a "you typed something wrong" page.
 */
const SQLSTATE_CODES: Record<string, PublicErrorCode> = {
  // unique_violation, e.g. slug already taken.
  "23505": "CONFLICT",
  // foreign_key_violation and check_violation: input the schema refused.
  "23503": "VALIDATION_ERROR",
  "23514": "VALIDATION_ERROR",
  // invalid_text_representation: a malformed uuid or number.
  "22P02": "VALIDATION_ERROR",
  // serialization_failure: safe to retry.
  "40001": "CONFLICT",
  // query_canceled by the 30 s statement timeout, and too_many_connections.
  "57014": "UNAVAILABLE",
  "53300": "UNAVAILABLE",
};

/** Socket-level failures, which mean the database is not reachable now. */
const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "EPIPE",
]);

export function isPublicErrorCode(value: unknown): value is PublicErrorCode {
  return typeof value === "string" && Object.hasOwn(PUBLIC_ERRORS, value);
}

/**
 * `AppError` messages in this repository are written for people ("Title is
 * required"). Anything else is treated as untrusted text and never copied.
 */
export class AppError extends Error {
  readonly code: PublicErrorCode;

  constructor(
    message: string,
    code: PublicErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input", options?: ErrorOptions) {
    super(message, "VALIDATION_ERROR", options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", options?: ErrorOptions) {
    super(message, "FORBIDDEN", options);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", options?: ErrorOptions) {
    super(message, "NOT_FOUND", options);
  }
}

export class ConflictError extends AppError {
  constructor(message = "That already exists", options?: ErrorOptions) {
    super(message, "CONFLICT", options);
  }
}

function codeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const candidate: unknown = (error as { code?: unknown }).code;
  return typeof candidate === "string" ? candidate : undefined;
}

function publicCodeFor(error: unknown): PublicErrorCode {
  if (error instanceof AppError) {
    // Even if error.code looks like a SQLSTATE, it must be in the public vocabulary
    if (isPublicErrorCode(error.code)) {
      return error.code;
    }
    // If it's an AppError with an invalid code, treat as INTERNAL
    return "INTERNAL";
  }

  const code = codeOf(error);
  if (code === undefined) {
    return "INTERNAL";
  }
  if (Object.hasOwn(SQLSTATE_CODES, code)) {
    return SQLSTATE_CODES[code];
  }
  if (NETWORK_CODES.has(code)) {
    return "UNAVAILABLE";
  }
  return "INTERNAL";
}

/**
 * The only supported way to turn a thrown value into something a browser sees.
 *
 * `requestId` is required rather than generated here so a route can reuse the
 * id from the `x-request-id` header and the log line, and so this module never
 * silently invents a second identity for one failure.
 */
export function toPublicError(
  error: unknown,
  requestId: string,
): PublicError {
  const code = publicCodeFor(error);
  const definition = PUBLIC_ERRORS[code];

  // An `AppError` carries a message this repository wrote for a person. It is
  // used only when it exists and is not empty; the fixed message is the floor.
  const message =
    error instanceof AppError && error.message.trim() !== ""
      ? error.message
      : definition.message;

  return { code, status: definition.status, message, requestId };
}
