import { describe, expect, it, vi } from "vitest";
import {
  getClientIp,
  normalizeRateLimitEmail,
  consumeRateLimit,
  rateLimitAuth,
} from "../src/modules/identity/limiter";
import * as dbModule from "../src/kernel/db";

describe("Gate G5: Rate limits and header rotation", () => {
  it("rotating x-forwarded-for does not reset the limit", async () => {
    // Simulate Vercel edge proxy: x-vercel-forwarded-for is pinned to true client IP
    const clientIp = "203.0.113.195";
    const action = "sign_in";
    const maxAttempts = 5;

    // Simulate 5 attempts from the same client IP, rotating x-forwarded-for each time
    for (let i = 1; i <= maxAttempts; i++) {
      const headers = {
        "x-vercel-forwarded-for": clientIp,
        "x-forwarded-for": `198.51.100.${i}`, // Attacker rotates spoofed header
      };
      const result = await rateLimitAuth(action, { headers }, { max: maxAttempts, windowSeconds: 600 });
      expect(result.allowed).toBe(true);
      expect(result.status).toBe(200);
    }

    // 6th attempt with yet another rotated x-forwarded-for must trip (429)
    const headersTrip = {
      "x-vercel-forwarded-for": clientIp,
      "x-forwarded-for": "198.51.100.99",
    };
    const resultTrip = await rateLimitAuth(action, { headers: headersTrip }, { max: maxAttempts, windowSeconds: 600 });
    expect(resultTrip.status).toBe(429);
    expect(resultTrip.allowed).toBe(false);
  });

  it("mixed-case and lookalike emails share one bucket", async () => {
    const action = "sign_in_email";
    const maxAttempts = 3;

    // 1st attempt: Alice@Example.COM
    const r1 = await rateLimitAuth(
      action,
      { email: "Alice@Example.COM", ip: "10.0.0.1" },
      { max: maxAttempts, windowSeconds: 600 },
    );
    expect(r1.allowed).toBe(true);

    // 2nd attempt: alice@example.com (lowercase)
    const r2 = await rateLimitAuth(
      action,
      { email: "alice@example.com", ip: "10.0.0.2" },
      { max: maxAttempts, windowSeconds: 600 },
    );
    expect(r2.allowed).toBe(true);

    // 3rd attempt: ALICE@EXAMPLE.COM (all caps)
    const r3 = await rateLimitAuth(
      action,
      { email: "ALICE@EXAMPLE.COM", ip: "10.0.0.3" },
      { max: maxAttempts, windowSeconds: 600 },
    );
    expect(r3.allowed).toBe(true);

    // 4th attempt: aLiCe@eXaMpLe.CoM should trip the email bucket
    const r4 = await rateLimitAuth(
      action,
      { email: "aLiCe@eXaMpLe.CoM", ip: "10.0.0.4" },
      { max: maxAttempts, windowSeconds: 600 },
    );
    expect(r4.allowed).toBe(false);
    expect(r4.status).toBe(429);
  });

  it("server-side auth.api paths have our own limiter", async () => {
    // Tests that rateLimitAuth can guard a server-side action and throw RateLimitError
    const email = "attacker@example.com";
    const max = 2;

    // Attempt 1: allowed
    await rateLimitAuth("auth_api_call", { email }, { max, windowSeconds: 60 });
    // Attempt 2: allowed
    await rateLimitAuth("auth_api_call", { email }, { max, windowSeconds: 60 });

    // Attempt 3: trips and throws or returns 429
    const res = await rateLimitAuth("auth_api_call", { email }, { max, windowSeconds: 60 });
    expect(res.allowed).toBe(false);
    expect(res.status).toBe(429);
  });

  it("normalizes client IP strictly prioritizing x-vercel-forwarded-for", () => {
    // x-vercel-forwarded-for present: ignored x-forwarded-for
    const ip1 = getClientIp({
      "x-vercel-forwarded-for": "203.0.113.50",
      "x-forwarded-for": "10.0.0.1",
    });
    expect(ip1).toBe("203.0.113.50");

    // trims and handles comma-separated hops in x-vercel-forwarded-for
    const ip2 = getClientIp({
      "x-vercel-forwarded-for": "203.0.113.50, 198.51.100.1",
    });
    expect(ip2).toBe("203.0.113.50");
  });

  it("normalizes email to lowercase and NFKC form", () => {
    expect(normalizeRateLimitEmail("  User@Example.Com  ")).toBe("user@example.com");
    // Full-width characters normalized via NFKC
    expect(normalizeRateLimitEmail("ｕｓｅｒ@example.com")).toBe("user@example.com");
  });

  it("fails closed when DATABASE_URL is configured and DB query throws", async () => {
    const prevDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://invalid:5432/nonexistent";
    const spy = vi.spyOn(dbModule, "getDb").mockImplementation(() => {
      throw new Error("ECONNREFUSED");
    });

    try {
      const res = await consumeRateLimit("ip:198.51.100.42:sign_in", { max: 5, windowSeconds: 600 });
      expect(res.allowed).toBe(false);
      expect(res.status).toBe(429);
      expect(res.remaining).toBe(0);
    } finally {
      spy.mockRestore();
      if (prevDbUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = prevDbUrl;
      }
    }
  });
});
