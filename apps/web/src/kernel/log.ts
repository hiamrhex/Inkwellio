/**
 * Kernel: the server log.
 *
 * One JSON object per line on stdout, which is what a serverless platform keeps
 * for an hour. This is the only file allowed to call `console` (ESLint enforces
 * it), because every other `console` call in a Next.js application is a way for
 * a value — a token, a connection string, a person's email — to end up in a
 * browser devtools panel.
 *
 * Redaction is by key name and by depth-limited JSON. A value that cannot be
 * serialised is replaced rather than thrown on: the logger must never be the
 * reason a request fails.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Keys whose values never belong in a log line. Deliberately broad. */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|session|email|connection|database_url|api[-_]?key/i;

const REDACTED = "[redacted]";

function sanitise(value: unknown, depth: number): unknown {
  if (depth > 4) {
    return "[truncated]";
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitise(entry, depth + 1));
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      output[key] = REDACTED;
      continue;
    }
    output[key] = sanitise(entry, depth + 1);
  }
  return output;
}

/**
 * Write one event. `event` is a short, stable name ("publish_failed"), not a
 * sentence, so it can be counted.
 */
export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  let line: string;
  try {
    line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      event,
      ...(sanitise(fields, 0) as Record<string, unknown>),
    });
  } catch {
    line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      event,
      log_error: "fields_not_serialisable",
    });
  }

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Log a failure and return the id the user will quote. The raw error is logged
 * here and nowhere else; the returned id is the only part that leaves the
 * server.
 */
export function logFailure(
  event: string,
  error: unknown,
  requestId: string,
  fields: Record<string, unknown> = {},
): string {
  logEvent("error", event, {
    ...fields,
    requestId,
    error: error instanceof Error ? error : String(error),
  });
  return requestId;
}
