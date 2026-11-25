import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const offlineEnv = vi.hoisted(() => ({
  hadDbUrl: Boolean(process.env.DATABASE_URL),
  rateCounts: new Map<string, number>(),
}));

vi.mock("@/kernel/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/kernel/db")>();
  if (offlineEnv.hadDbUrl) {
    return actual;
  }

  const chainableSelect = () => {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      then: (resolve: (v: unknown[]) => void) => resolve([]),
    };
    return chain;
  };

  const chainableInsert = () => ({
    values: (vals: { key?: string; count?: number }) => {
      const key = vals?.key ?? "default";
      const nextCount = (offlineEnv.rateCounts.get(key) ?? 0) + 1;
      offlineEnv.rateCounts.set(key, nextCount);
      return {
        onConflictDoUpdate: () => ({
          returning: () => Promise.resolve([{ count: nextCount }]),
        }),
        returning: () => Promise.resolve([{ ...vals, count: nextCount }]),
        then: (resolve: (v: unknown[]) => void) => resolve([{ ...vals, count: nextCount }]),
      };
    },
  });

  const chainableUpdate = () => ({
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve([]),
        then: (resolve: (v: unknown[]) => void) => resolve([]),
      }),
    }),
  });

  return {
    ...actual,
    getDb: () =>
      ({
        select: chainableSelect,
        insert: chainableInsert,
        update: chainableUpdate,
      }) as unknown as ReturnType<typeof actual.getDb>,
  };
});

import { GET, POST } from "../src/app/api/auth/[...all]/route";
import { policy } from "../src/app/api/auth/[...all]/policy";
import "../src/modules/identity";

describe("Step 4: Better Auth HTTP Endpoint (/api/auth/[...all])", () => {
  const prevDbUrl = process.env.DATABASE_URL;

  beforeAll(() => {
    if (!offlineEnv.hadDbUrl) {
      process.env.DATABASE_URL = "postgres://offline-unit-test:5432/inkwellio";
    }
  });

  afterAll(() => {
    if (!offlineEnv.hadDbUrl) {
      if (prevDbUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = prevDbUrl;
      }
    }
  });

  it("declares explicit sibling policy.ts as public", () => {
    expect(policy).toBe("public");
  });

  it("responds cleanly on real GET /api/auth/ok handler invocation", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/ok", {
      method: "GET",
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });

  it("fails closed with 429 under spoofed x-forwarded-for rotation on POST", async () => {
    const pinnedIp = "203.0.113.250";
    let lastStatus = 0;

    for (let i = 1; i <= 6; i++) {
      const req = new NextRequest("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": pinnedIp,
          "x-forwarded-for": `198.51.100.${i}`,
        },
        body: JSON.stringify({
          email: "rate-limit-route-test@example.com",
          password: "wrong-password-123",
        }),
      });
      const res = await POST(req);
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});
