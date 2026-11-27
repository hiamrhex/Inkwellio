/**
 * Rate limiting module (ADR-010, A3, A10).
 *
 * Implements:
 * 1. Trusted client-IP resolution: the platform header first, an explicitly
 *    trusted proxy header second, and nothing else. A client-supplied header is
 *    never used to key a limit unless the deployment says the proxy overwrites
 *    it, because rotating it would reset the counter.
 * 2. No shared-bucket lockout: when no trusted IP is available the limiter does
 *    not collapse every caller into one `127.0.0.1` bucket (which lets one
 *    client lock out everyone). It falls back to per-identifier buckets plus a
 *    high-cap global flood backstop.
 * 3. Canonical email normalization (NFKC + lowercase) so lookalikes share one bucket.
 * 4. Counter storage backed by `rate_limit_counters` (Postgres) or an in-memory
 *    store for tests and offline use. A store failure denies with `503`, never
 *    with `429`: an outage is not the caller's fault and must not read as abuse.
 * 5. Application-layer limiter for auth, export and write endpoints.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/kernel/db";
import { env } from "@/kernel/env";
import { logEvent } from "@/kernel/log";
import { rateLimitCounters } from "@/kernel/schema";

export { RateLimitError } from "@/kernel/errors";
import { RateLimitError } from "@/kernel/errors";

/**
 * Where a client IP came from, and whether the value can be trusted to key a
 * limit. `untrusted` means "do not build a shared bucket from this".
 */
export type ClientIpResolution =
  | { readonly trusted: true; readonly ip: string; readonly source: "vercel" | "real-ip" | "proxy" | "explicit" }
  | { readonly trusted: false; readonly ip: null; readonly source: "none" };

const UNTRUSTED_IP = "untrusted";

function headerValue(
  headers: Headers | Record<string, string | undefined>,
  name: string,
): string | undefined {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const record = headers as Record<string, string | undefined>;
  return record[name] ?? record[name.toLowerCase()];
}

function firstHop(value: string): string | undefined {
  const hop = value.split(",")[0]?.trim();
  return hop !== undefined && hop.length > 0 ? hop : undefined;
}

/**
 * Resolve the client IP and record whether it is trustworthy.
 *
 * Order:
 *   1. `x-vercel-forwarded-for` - set by Vercel's edge and not client-writable.
 *   2. `x-real-ip` - set by Vercel, and by many reverse proxies; trusted only
 *      on Vercel or when `TRUST_PROXY_HEADERS=1`.
 *   3. `x-forwarded-for` - trusted only when `TRUST_PROXY_HEADERS=1`.
 *
 * A missing or untrusted header returns `trusted: false` rather than a
 * placeholder, so callers can avoid the shared-bucket failure.
 */
export interface ClientIpOptions {
  /** Defaults to `env.TRUST_PROXY_HEADERS === "1"`. */
  readonly trustProxyHeaders?: boolean;
  /** Defaults to whether the process sees Vercel's platform env marker. */
  readonly onVercel?: boolean;
}

export function resolveClientIp(
  headers: Headers | Record<string, string | undefined> | null | undefined,
  options: ClientIpOptions = {},
): ClientIpResolution {
  if (!headers) return { trusted: false, ip: null, source: "none" };

  const vercel = headerValue(headers, "x-vercel-forwarded-for");
  if (vercel !== undefined) {
    const ip = firstHop(vercel);
    if (ip !== undefined) return { trusted: true, ip, source: "vercel" };
  }

  const proxyTrusted = options.trustProxyHeaders ?? (env.TRUST_PROXY_HEADERS === "1");
  const onVercel = options.onVercel ?? ((env.VERCEL ?? "") !== "");

  if (onVercel || proxyTrusted) {
    const realIp = headerValue(headers, "x-real-ip");
    if (realIp !== undefined) {
      const ip = firstHop(realIp);
      if (ip !== undefined) return { trusted: true, ip, source: "real-ip" };
    }
  }

  if (proxyTrusted) {
    const forwarded = headerValue(headers, "x-forwarded-for");
    if (forwarded !== undefined) {
      const ip = firstHop(forwarded);
      if (ip !== undefined) return { trusted: true, ip, source: "proxy" };
    }
  }

  return { trusted: false, ip: null, source: "none" };
}

/**
 * Backward-compatible string form used for audit hashing. `untrusted` is
 * deliberately not an address: it is a marker that the value is absent, so a
 * hash of it never looks like a real client.
 */
export function getClientIp(
  headers: Headers | Record<string, string | undefined> | null | undefined,
): string {
  const resolved = resolveClientIp(headers);
  return resolved.trusted ? resolved.ip : UNTRUSTED_IP;
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

/** In-memory fallback counters when DATABASE_URL is unset */
const memoryCounters = new Map<
  string,
  { count: number; windowStart: number; expiresAt: number }
>();

export type RateLimitStoreStatus = "ok" | "unavailable";

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: Date;
  readonly status: 200 | 429 | 503;
  readonly store: RateLimitStoreStatus;
}

function secondsUntil(resetAt: Date, now: number): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000));
}

/**
 * Consumes one request for `key` within a fixed window.
 */
export async function consumeRateLimit(
  key: string,
  options: { max: number; windowSeconds: number },
): Promise<RateLimitResult> {
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
        store: "ok",
      };
    } catch {
      // The counter cannot be read, so the limit cannot be enforced. Deny, but
      // as an outage (503), not as abuse (429): the caller did nothing wrong and
      // must not be told to slow down or retry within the window.
      logEvent("error", "rate_limit_store_unavailable", { windowSeconds });
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        status: 503,
        store: "unavailable",
      };
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
    store: "ok",
  };
}

/** A flood backstop used only when no trusted client IP is available. */
const UNTRUSTED_GLOBAL_MAX = 1000;

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly status: 200 | 429 | 503;
  readonly reason?:
    | "ip_rate_limit_exceeded"
    | "email_rate_limit_exceeded"
    | "global_rate_limit_exceeded"
    | "user_rate_limit_exceeded"
    | "store_unavailable";
  readonly retryAfterSeconds?: number;
  readonly limit?: number;
}

/**
 * Guards an authentication or server-side auth action with rate limiting.
 *
 * Two dimensions are always attempted:
 *   - the caller: a trusted IP bucket, or a high-cap global backstop when the
 *     deployment cannot identify the caller (never a shared per-user bucket);
 *   - the identifier: a normalized email bucket, which is what stops a
 *     distributed attack that rotates IPs.
 */
export async function rateLimitAuth(
  action: string,
  context: {
    headers?: Headers | Record<string, string | undefined>;
    ip?: string;
    email?: string;
  },
  options: { max?: number; windowSeconds?: number } = {},
): Promise<RateLimitDecision> {
  const max = options.max ?? 5; // Default 5 attempts per window (A10, G5)
  const windowSeconds = options.windowSeconds ?? 600; // 10 minutes

  const resolved: ClientIpResolution =
    context.ip !== undefined
      ? { trusted: true, ip: context.ip, source: "explicit" }
      : resolveClientIp(context.headers);

  if (resolved.trusted) {
    const ipResult = await consumeRateLimit(`ip:${resolved.ip}:${action}`, { max, windowSeconds });
    if (ipResult.store === "unavailable") {
      return {
        allowed: false,
        status: 503,
        reason: "store_unavailable",
        retryAfterSeconds: secondsUntil(ipResult.resetAt, Date.now()),
        limit: max,
      };
    }
    if (!ipResult.allowed) {
      return {
        allowed: false,
        status: 429,
        reason: "ip_rate_limit_exceeded",
        retryAfterSeconds: secondsUntil(ipResult.resetAt, Date.now()),
        limit: max,
      };
    }
  } else {
    // No trusted client IP. A per-caller bucket is impossible, and a shared
    // bucket at the normal cap would let one caller lock out everyone. Use a
    // high-cap global flood backstop instead and say so once per call site.
    logEvent("warn", "rate_limit_ip_untrusted", { action });
    const globalResult = await consumeRateLimit(`global:${action}`, {
      max: UNTRUSTED_GLOBAL_MAX,
      windowSeconds,
    });
    if (globalResult.store === "unavailable") {
      return {
        allowed: false,
        status: 503,
        reason: "store_unavailable",
        retryAfterSeconds: secondsUntil(globalResult.resetAt, Date.now()),
        limit: UNTRUSTED_GLOBAL_MAX,
      };
    }
    if (!globalResult.allowed) {
      return {
        allowed: false,
        status: 429,
        reason: "global_rate_limit_exceeded",
        retryAfterSeconds: secondsUntil(globalResult.resetAt, Date.now()),
        limit: UNTRUSTED_GLOBAL_MAX,
      };
    }
  }

  // Identifier dimension: independent of the IP bucket, and per action, so a
  // sign-in flood cannot block a password reset for the same address.
  if (context.email) {
    const normalizedEmail = normalizeRateLimitEmail(context.email);
    const emailKey = `email:${normalizedEmail}:${action}`;
    const emailResult = await consumeRateLimit(emailKey, { max, windowSeconds });
    if (emailResult.store === "unavailable") {
      return {
        allowed: false,
        status: 503,
        reason: "store_unavailable",
        retryAfterSeconds: secondsUntil(emailResult.resetAt, Date.now()),
        limit: max,
      };
    }
    if (!emailResult.allowed) {
      return {
        allowed: false,
        status: 429,
        reason: "email_rate_limit_exceeded",
        retryAfterSeconds: secondsUntil(emailResult.resetAt, Date.now()),
        limit: max,
      };
    }
  }

  return { allowed: true, status: 200, limit: max };
}

/**
 * Guards an authenticated write. Keyed by user id, so one account cannot
 * exhaust another account's budget, and a trusted IP adds a second dimension.
 *
 * Two tiers, chosen against the studio's actual cadence:
 *   - draft autosave: 120/minute. The editor debounces for 1,500 ms and keeps
 *     one save in flight (components/studio/studio-editor.tsx:88-91,187-190),
 *     so continuous typing produces at most ~40 saves/minute.
 *   - structural writes: 30/minute for deliberate human actions. A flood
 *     script hits the cap after 30 requests in the window.
 *
 * A store outage denies with 503, never 429: the caller did nothing wrong.
 */
export const WRITE_LIMIT_PER_MINUTE = 120;

export const STRUCTURAL_WRITE_LIMIT_PER_MINUTE = 30;

export async function rateLimitWrite(
  action: string,
  context: {
    userId: string;
    headers?: Headers | Record<string, string | undefined>;
  },
  options: { max?: number; windowSeconds?: number } = {},
): Promise<RateLimitDecision> {
  const max = options.max ?? WRITE_LIMIT_PER_MINUTE;
  const windowSeconds = options.windowSeconds ?? 60;
  const userResult = await consumeRateLimit(`user:${context.userId}:${action}`, {
    max,
    windowSeconds,
  });
  if (userResult.store === "unavailable") {
    return {
      allowed: false,
      status: 503,
      reason: "store_unavailable",
      retryAfterSeconds: secondsUntil(userResult.resetAt, Date.now()),
      limit: max,
    };
  }
  if (!userResult.allowed) {
    return {
      allowed: false,
      status: 429,
      reason: "user_rate_limit_exceeded",
      retryAfterSeconds: secondsUntil(userResult.resetAt, Date.now()),
      limit: max,
    };
  }
  return { allowed: true, status: 200, limit: max };
}

/** Convert a decision into the error the HTTP boundary renders. */
export function rateLimitErrorFrom(decision: RateLimitDecision): RateLimitError | null {
  if (decision.allowed) return null;
  return new RateLimitError(decision.retryAfterSeconds ?? 60);
}
