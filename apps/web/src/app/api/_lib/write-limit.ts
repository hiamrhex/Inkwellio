import { AppError } from "@/kernel/errors";
import {
  rateLimitErrorFrom,
  rateLimitWrite,
  STRUCTURAL_WRITE_LIMIT_PER_MINUTE,
  WRITE_LIMIT_PER_MINUTE,
} from "@/modules/identity";

/**
 * The shared write-limit gate for owner write routes.
 *
 * Routes call this after `requireUser`, so the bucket is keyed by a verified
 * user id rather than by a client header. Throwing (rather than returning a
 * Response) keeps every route on the one `jsonError` boundary:
 *   - a breach becomes 429 `RATE_LIMITED` with `Retry-After` and `requestId`;
 *   - a counter-store outage becomes 503 `UNAVAILABLE` with `requestId`, never
 *     429.
 */
export async function enforceWriteLimit(
  action: string,
  userId: string,
  options: { structural?: boolean } = {},
): Promise<void> {
  const decision = await rateLimitWrite(
    action,
    { userId },
    {
      max: options.structural
        ? STRUCTURAL_WRITE_LIMIT_PER_MINUTE
        : WRITE_LIMIT_PER_MINUTE,
      windowSeconds: 60,
    },
  );

  if (decision.status === 503) {
    throw new AppError("Temporarily unavailable", "UNAVAILABLE");
  }
  const error = rateLimitErrorFrom(decision);
  if (error !== null) {
    throw error;
  }
}
