import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getPool } from "../../src/kernel/db";
import { getCapturingTransport } from "../../src/modules/identity";
import { GET, POST } from "../../src/app/api/auth/[...all]/route";

const DATABASE_URL = process.env.DATABASE_URL?.trim() || undefined;
const REQUIRED =
  process.env.REQUIRE_DB === "1" ||
  process.env.CI === "true" ||
  process.env.REQUIRE_DATABASE === "1";

const DRIZZLE_DIR = fileURLToPath(new URL("../../drizzle/", import.meta.url));

type Journal = { entries: Array<{ tag: string }> };

function migrationStatements(): string[] {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8"),
  ) as Journal;
  return journal.entries.flatMap((entry) =>
    readFileSync(join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0),
  );
}

function extractCookieHeader(res: Response): string {
  const setCookies =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [];
  if (setCookies.length > 0) {
    return setCookies.map((c) => c.split(";")[0]).join("; ");
  }
  const single = res.headers.get("set-cookie");
  return single ? single.split(";")[0] ?? "" : "";
}

describe("wp2 auth e2e suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "DATABASE_URL must be provided when REQUIRE_DB=1 or CI=true").toBeTruthy();
    expect(DATABASE_URL).toMatch(/^postgres(ql)?:\/\//);
  });
});

describe.skipIf(!DATABASE_URL)("WP2 Real-Postgres Auth E2E (/api/auth/[...all])", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = getPool();
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    for (const statement of migrationStatements()) {
      await pool.query(statement);
    }
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  it("executes sign-up -> email verification capture -> sign-in -> session -> sign-out against real Postgres", async () => {
    const transport = getCapturingTransport();
    transport.clear();

    const email = `wp2-e2e-${Date.now()}@example.com`;
    const password = "CorrectHorse-BatteryStaple-2026!";

    // 1. Sign up
    const signUpReq = new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-forwarded-for": "198.51.100.10",
      },
      body: JSON.stringify({
        name: "WP2 E2E Writer",
        email,
        password,
      }),
    });
    const signUpRes = await POST(signUpReq);
    expect(signUpRes.status).toBe(200);
    const signUpBody = (await signUpRes.json()) as { user?: { id: string; email: string } };
    expect(signUpBody.user?.email).toBe(email);

    // 2. Verification email captured via CapturingTransport
    const captured = transport.getLastSentEmail();
    expect(captured).toBeDefined();
    expect(captured?.type).toBe("verification");
    expect(captured?.to).toBe(email);
    expect(captured?.token).toBeTruthy();

    // 3. Verify email using the real Better Auth endpoint
    const verifyUrl = new URL(captured!.url);
    const verifyReq = new NextRequest(verifyUrl.toString(), {
      method: "GET",
      headers: {
        "x-vercel-forwarded-for": "198.51.100.10",
      },
    });
    const verifyRes = await GET(verifyReq);
    expect([200, 302]).toContain(verifyRes.status);

    // 4. Sign in with verified credentials
    const signInReq = new NextRequest("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-forwarded-for": "198.51.100.10",
      },
      body: JSON.stringify({ email, password }),
    });
    const signInRes = await POST(signInReq);
    expect(signInRes.status).toBe(200);
    const sessionCookie = extractCookieHeader(signInRes);
    expect(sessionCookie).toContain("session_token=");

    // 5. Authenticated session check
    const getSessionReq = new NextRequest("http://localhost:3000/api/auth/get-session", {
      method: "GET",
      headers: {
        cookie: sessionCookie,
        "x-vercel-forwarded-for": "198.51.100.10",
      },
    });
    const getSessionRes = await GET(getSessionReq);
    expect(getSessionRes.status).toBe(200);
    const sessionBody = (await getSessionRes.json()) as { user?: { email: string }; session?: { id: string } };
    expect(sessionBody.user?.email).toBe(email);
    expect(sessionBody.session?.id).toBeTruthy();

    // 6. Sign out revokes session in real Postgres
    const signOutReq = new NextRequest("http://localhost:3000/api/auth/sign-out", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
        "x-vercel-forwarded-for": "198.51.100.10",
      },
      body: JSON.stringify({}),
    });
    const signOutRes = await POST(signOutReq);
    expect(signOutRes.status).toBe(200);

    // 7. Subsequent session check is null after sign-out
    const postSignOutSessionReq = new NextRequest("http://localhost:3000/api/auth/get-session", {
      method: "GET",
      headers: {
        cookie: sessionCookie,
        "x-vercel-forwarded-for": "198.51.100.10",
      },
    });
    const postSignOutSessionRes = await GET(postSignOutSessionReq);
    expect(postSignOutSessionRes.status).toBe(200);
    const postSignOutBody = (await postSignOutSessionRes.json()) as { session?: unknown } | null;
    expect(postSignOutBody?.session ?? null).toBeNull();
  });

  it("triggers real DB 429 rate limit on rotating x-forwarded-for with pinned x-vercel-forwarded-for", async () => {
    const pinnedIp = "203.0.113.177";
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
          email: `db-rate-limit-${Date.now()}@example.com`,
          password: "wrong-password-123",
        }),
      });
      const res = await POST(req);
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);

    const dbCounter = await pool.query<{ count: number }>(
      "SELECT count FROM rate_limit_counters WHERE key = $1",
      [`ip:${pinnedIp}:auth:sign-in/email`],
    );
    expect(dbCounter.rows[0]?.count).toBeGreaterThanOrEqual(6);
  });
});
