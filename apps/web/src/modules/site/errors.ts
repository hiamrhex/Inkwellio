import { AppError } from "@/kernel/errors";

/**
 * Raised when a public read exceeds the configured database or cache-fill timeout
 * budget (A9: inner timeout < platform 300s ceiling).
 */
export class ReadTimeoutError extends AppError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super("Temporarily unavailable", "UNAVAILABLE");
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Raised when a public read fails because the underlying database is unreachable
 * or unavailable, hiding driver and connection-string details from clients.
 */
export class PublicReadUnavailableError extends AppError {
  constructor(options?: ErrorOptions) {
    super("Temporarily unavailable", "UNAVAILABLE", options);
  }
}
