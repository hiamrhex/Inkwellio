/**
 * Rate limiting module (ADR-010, A3, A10).
 *
 * Implements:
 * 1. Pinned header resolution for IP (strictly x-vercel-forwarded-for first;
 *    rotating x-forwarded-for cannot bypass or reset the limiter).
 * 2. Canonical email normalization (NFKC + lowercase) so lookalikes share one bucket.
 * 3. Counter storage backed by `rate_limit_counters` (Postgres) or atomic memory store.
 * 4. Application-layer limiter for server-side auth and action endpoints.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/kernel/db";
import { rateLimitCounters } from "@/kernel/schema";

export class RateLimitError extends Error {
  readonly status = 429;
  readonly code = "RATE_LIMITED";

  constructor(message = "Too many requests") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Normalizes email address for rate limit keying.
 *
 * Trims whitespace, converts to lowercase, and applies Unicode NFKC
 * normalization to collapse lookalike characters and full-width forms.
 */
export function normalizeRateLimitEmail(email: string): string {
  if (!email) return "";
  return email.trim().toLowerCase().normalize("NFKC");
}

/**
 * Extracts client IP prioritizing the pinned Vercel header (A3).
 *
 * Better Auth and our limiter check `x-vercel-forwarded-for` first.
 * If present, any spoofed `x-forwarded-for` header is ignored.
 */
export function getClientIp(
  headers: Headers | Record<string, string | undefined> | null | undefined,
): string {
  if (!headers) return "127.0.0.1";

  const getHeader = (name: string): string | undefined => {
    if (typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(name) ?? undefined;
    }
    const record = headers as Record<string, string | undefined>;
    return record[name] ?? record[name.toLowerCase()];
  };

  // 1. Strictly check x-vercel-forwarded-for first (pinned header)
  const vercelForwarded = getHeader("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const firstHop = vercelForwarded.split(",")[0]?.trim();
    if (firstHop) return firstHop;
  }

  // 2. Fall back to x-forwarded-for only if x-vercel-forwarded-for is missing
  const forwarded = getHeader("x-forwarded-for");
  if (forwarded) {
    const firstHop = forwarded.split(",")[0]?.trim();
    if (firstHop) return firstHop;
  }

  return "127.0.0.1";
}

/** In-memory fallback counters when DATABASE_URL is unset */
const memoryCounters = new Map<
  string,
  { count: number; windowStart: number; expiresAt: number }
>();

/**
 * Consumes one request for `key` within a fixed window.
 */
export async function consumeRateLimit(
  key: string,
  options: { max: number; windowSeconds: number },
): Promise<{ allowed: boolean; remaining: number; resetAt: Date; status: number }> {
  const { max, windowSeconds } = options;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStartDate = new Date(windowStartMs);
  const resetAt = new Date(windowStartMs + windowMs);
  const expiresAt = new Date(windowStartMs + windowMs * 2);

  // If live database is connected, use rate_limit_counters table
  if (process.env.DATABASE_URL) {
    try {
      const db = getDb();
      const result = await db
        .insert(rateLimitCounters)
        .values({
          key,
          windowStart: windowStartDate,
          count: 1,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [rateLimitCounters.key, rateLimitCounters.windowStart],
          set: {
            count: sql`${rateLimitCounters.count} + 1`,
          },
        })
        .returning({ count: rateLimitCounters.count });

      const currentCount = result[0]?.count ?? 1;
      const allowed = currentCount <= max;
      return {
        allowed,
        remaining: Math.max(0, max - currentCount),
        resetAt,
        status: allowed ? 200 : 429,
      };
    } catch {
      // Fallback to memory store if query fails
    }
  }

  // Atomic memory counter for unit tests & offline mode
  const bucketKey = `${key}:${windowStartMs}`;
  const existing = memoryCounters.get(bucketKey);
  const currentCount = (existing?.count ?? 0) + 1;
  memoryCounters.set(bucketKey, {
    count: currentCount,
    windowStart: windowStartMs,
    expiresAt: expiresAt.getTime(),
  });

  // Simple garbage collection of expired buckets
  if (memoryCounters.size > 1000) {
    for (const [k, v] of memoryCounters.entries()) {
      if (v.expiresAt < now) {
        memoryCounters.delete(k);
      }
    }
  }

  const allowed = currentCount <= max;
  return {
    allowed,
    remaining: Math.max(0, max - currentCount),
    resetAt,
    status: allowed ? 200 : 429,
  };
}

/**
 * Guards an authentication or server-side auth action with rate limiting.
 */
export async function rateLimitAuth(
  action: string,
  context: {
    headers?: Headers | Record<string, string | undefined>;
    ip?: string;
    email?: string;
  },
  options: { max?: number; windowSeconds?: number } = {},
): Promise<{ allowed: boolean; status: number; reason?: string }> {
  const max = options.max ?? 5; // Default 5 attempts per window (A10, G5)
  const windowSeconds = options.windowSeconds ?? 600; // 10 minutes

  // 1. IP rate limiting
  const ip = context.ip ?? getClientIp(context.headers);
  const ipKey = `ip:${ip}:${action}`;
  const ipResult = await consumeRateLimit(ipKey, { max, windowSeconds });
  if (!ipResult.allowed) {
    return { allowed: false, status: 429, reason: "ip_rate_limit_exceeded" };
  }

  // 2. Email rate limiting (if provided)
  if (context.email) {
    const normalizedEmail = normalizeRateLimitEmail(context.email);
    const emailKey = `email:${normalizedEmail}:${action}`;
    const emailResult = await consumeRateLimit(emailKey, { max, windowSeconds });
    if (!emailResult.allowed) {
      return { allowed: false, status: 429, reason: "email_rate_limit_exceeded" };
    }
  }

  return { allowed: true, status: 200 };
}
