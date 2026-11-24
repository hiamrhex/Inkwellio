import { AppError } from "@/kernel/errors";
import { isServiceError } from "@/modules/posts";
import { PublicReadUnavailableError, ReadTimeoutError } from "./errors";

/**
 * A9 budget: cache fill & statement ceiling = 15 s (well below Vercel's 300 s limit).
 */
export const READ_TIMEOUT_MS = 15_000;

/**
 * Normalizes unexpected database, socket, or timeout failures into an
 * `AppError` with code `"UNAVAILABLE"` so raw driver messages, SQLSTATEs,
 * or connection strings never leak across the RSC/HTTP boundary.
 */
export function normalizeReadError(error: unknown): Error {
  if (error instanceof AppError || isServiceError(error)) {
    return error;
  }
  return new PublicReadUnavailableError({ cause: error });
}

/**
 * Bounds an asynchronous read operation to `timeoutMs`, cleaning up its timer
 * when the promise settles so event-loop handles never leak.
 */
export async function withReadTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs = READ_TIMEOUT_MS,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ReadTimeoutError(timeoutMs);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ReadTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } catch (error) {
    throw normalizeReadError(error);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
