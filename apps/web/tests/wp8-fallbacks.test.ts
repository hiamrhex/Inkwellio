import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, RateLimitError } from "../src/kernel/errors";
import { jsonError, requestIdFrom } from "../src/app/api/_lib/respond";
import {
  getClientIp,
  rateLimitAuth,
  resolveClientIp,
  type RateLimitDecision,
} from "../src/modules/identity/limiter";

/**
 * Fallback-path proofs for the resilience matrix (docs/FAILURE_MODES.md, 5b).
 * These are code-level drills: no external service is contacted.
 */
describe("WP8 fallbacks: one error shape and a trustworthy rate-limit key", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a 429 with code, message, requestId and Retry-After", async () => {
    const response = jsonError(new RateLimitError(37), "req-429-proof");
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      code: "RATE_LIMITED",
      status: 429,
      message: "Too many requests",
      requestId: "req-429-proof",
    });
  });

  it("keeps Retry-After at least one second so a retry cannot spin in the same window", async () => {
    const response = jsonError(new RateLimitError(0), "req-0");
    expect(response.headers.get("retry-after")).toBe("1");
  });

  it("renders a dependency outage as 503 UNAVAILABLE, not 429", async () => {
    const response = jsonError(new AppError("Temporarily unavailable", "UNAVAILABLE"), "req-503");
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeNull();
    expect(await response.json()).toMatchObject({
      code: "UNAVAILABLE",
      requestId: "req-503",
    });
  });

  it("reuses a bounded request id from the header instead of inventing a second one", () => {
    expect(requestIdFrom(new Headers({ "x-request-id": "client-supplied-123" }))).toBe(
      "client-supplied-123",
    );
    const unbounded = "x".repeat(500);
    expect(requestIdFrom(new Headers({ "x-request-id": unbounded }))).not.toBe(unbounded);
  });

  it("ignores a client-supplied x-forwarded-for by default", () => {
    const headers = {
      "x-forwarded-for": "203.0.113.7",
      "x-real-ip": "203.0.113.8",
    };
    expect(resolveClientIp(headers)).toEqual({ trusted: false, ip: null, source: "none" });
    expect(getClientIp(headers)).toBe("untrusted");
  });

  it("uses the Vercel header even when the client also sends a spoofed header", () => {
    expect(
      resolveClientIp({
        "x-vercel-forwarded-for": "198.51.100.9, 203.0.113.200",
        "x-forwarded-for": "203.0.113.200",
      }),
    ).toEqual({ trusted: true, ip: "198.51.100.9", source: "vercel" });
  });

  it("trusts x-forwarded-for only when the deployment explicitly opts in", () => {
    const headers = { "x-forwarded-for": "203.0.113.7" };
    expect(resolveClientIp(headers, { trustProxyHeaders: false }).trusted).toBe(false);
    expect(resolveClientIp(headers, { trustProxyHeaders: true })).toEqual({
      trusted: true,
      ip: "203.0.113.7",
      source: "proxy",
    });
  });

  it("does not let a missing trusted IP put every caller in one low-cap bucket", async () => {
    // Twenty different identifiers, no trusted IP, max 5 per identifier. A
    // shared fallback bucket at max 5 would refuse everyone from attempt 6;
    // per-identifier buckets plus a 1000-request flood backstop allow all 20.
    for (let i = 0; i < 20; i += 1) {
      const decision = await rateLimitAuth(
        "auth:no-trusted-ip-proof",
        { headers: {}, email: `caller-${i}@example.test` },
        { max: 5, windowSeconds: 600 },
      );
      expect(decision.allowed, `caller ${i}`).toBe(true);
    }
  });

  it("still stops a single identifier that rotates its IP header", async () => {
    const email = "flood@example.test";
    const action = "auth:flood-proof";
    for (let i = 0; i < 5; i += 1) {
      const decision = await rateLimitAuth(
        action,
        { headers: { "x-forwarded-for": `203.0.113.${i}` }, email },
        { max: 5, windowSeconds: 600 },
      );
      expect(decision.allowed).toBe(true);
    }
    const refused: RateLimitDecision = await rateLimitAuth(
      action,
      { headers: { "x-forwarded-for": "203.0.113.99" }, email },
      { max: 5, windowSeconds: 600 },
    );
    expect(refused.allowed).toBe(false);
    expect(refused.status).toBe(429);
    expect(refused.reason).toBe("email_rate_limit_exceeded");
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
