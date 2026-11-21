import { describe, expect, it } from "vitest";
import { GET, checkDatabaseHealth } from "../src/app/api/health/route";
import { policy } from "../src/app/api/health/policy";

describe("B3: Health check endpoint (/api/health, A11)", () => {
  it("has sibling policy 'public'", () => {
    expect(policy).toBe("public");
  });

  it("returns 503 when DATABASE_URL is unset", async () => {
    // In local unit test environment without DATABASE_URL
    const origUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const response = await GET();
      expect(response.status).toBe(503);

      const body = await response.json();
      expect(body).toEqual({ status: "unavailable" });

      // Minimal headers
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    } finally {
      if (origUrl) process.env.DATABASE_URL = origUrl;
    }
  });

  it("enforces 5-second timeout on unresponsive database", async () => {
    // Passes a small timeout (e.g. 50ms) to checkDatabaseHealth with invalid DB
    const start = performance.now();
    const healthy = await checkDatabaseHealth(50);
    const duration = performance.now() - start;

    expect(healthy).toBe(false);
    expect(duration).toBeLessThan(1000); // Does not hang or exceed limit
  });

  it("returns minimal body without internal leak or stack trace", async () => {
    const response = await GET();
    const body = await response.json();

    const keys = Object.keys(body);
    expect(keys).toEqual(["status"]);
    expect(["ok", "unavailable"]).toContain(body.status);
  });
});
