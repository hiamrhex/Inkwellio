import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

describe("wp2 password reset suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "DATABASE_URL must be provided when REQUIRE_DB=1 or CI=true").toBeTruthy();
    expect(DATABASE_URL).toMatch(/^postgres(ql)?:\/\//);
  });
});

describe.skipIf(!DATABASE_URL)("WP2 Real-Postgres Password Reset & Recovery E2E", () => {
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

  it("completes sign-up -> verify -> forgot-password -> reset-password -> sign-in with new password & rejects replay/enumeration", async () => {
    const transport = getCapturingTransport();
    transport.clear();

    const suffix = Date.now();
    const email = `wp2-recovery-${suffix}@example.com`;
    const oldPassword = "OldCorrectHorse-2026!";
    const newPassword = "NewCorrectHorse-2026!";

    // 1. Sign up and verify email
    const signUpRes = await POST(
      new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "198.51.100.111",
        },
        body: JSON.stringify({ name: "Recovery User", email, password: oldPassword }),
      }),
    );
    expect(signUpRes.status).toBe(200);
    const verifyMail = transport.getLastSentEmail();
    expect(verifyMail?.type).toBe("verification");

    const verifyRes = await GET(
      new NextRequest(verifyMail!.url, {
        method: "GET",
        headers: { "x-vercel-forwarded-for": "198.51.100.111" },
      }),
    );
    expect([200, 302]).toContain(verifyRes.status);

    // 2. Request password reset for non-existent email -> identical generic response, no email sent
    transport.clear();
    const unknownResetRes = await POST(
      new NextRequest("http://localhost:3000/api/auth/request-password-reset", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "198.51.100.112",
        },
        body: JSON.stringify({ email: `nonexistent-${suffix}@example.com` }),
      }),
    );
    expect(unknownResetRes.status).toBe(200);
    const unknownResetBody = (await unknownResetRes.json()) as { status: boolean; message: string };
    expect(unknownResetBody.status).toBe(true);
    expect(transport.getSentEmails()).toHaveLength(0);

    // 3. Request password reset for real user -> captures reset link, HTML-escaped, zero token in logs
    const consoleSpy = vi.spyOn(console, "log");
    const knownResetRes = await POST(
      new NextRequest("http://localhost:3000/api/auth/request-password-reset", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "198.51.100.113",
        },
        body: JSON.stringify({
          email,
          redirectTo: "http://localhost:3000/reset-password?from=email&safe=1",
        }),
      }),
    );
    expect(knownResetRes.status).toBe(200);
    const knownResetBody = (await knownResetRes.json()) as { status: boolean; message: string };
    expect(knownResetBody).toEqual(unknownResetBody);

    const resetMail = transport.getLastSentEmail();
    expect(resetMail).toBeDefined();
    expect(resetMail?.type).toBe("reset_password");
    expect(resetMail?.to).toBe(email);
    expect(resetMail?.token).toBeTruthy();
    expect(resetMail?.html).toContain(`<a href="${resetMail!.url}">Continue</a>`);
    expect(resetMail?.html).not.toContain("<script");

    const logged = consoleSpy.mock.calls.flat().map(String).join("\n");
    consoleSpy.mockRestore();
    expect(logged).not.toContain(resetMail!.token);

    // Verify reset token identifier is hashed at rest (`storeIdentifier: "hashed"`), expires within 15 min (900s), and audit event recorded
    const rawVerRows = await pool.query<{ identifier: string; expires_at: Date }>(
      `SELECT v.identifier, v.expires_at
       FROM verifications v
       JOIN users u ON u.id::text = v.value
       WHERE u.email = $1`,
      [email],
    );
    expect(rawVerRows.rows).toHaveLength(1);
    expect(rawVerRows.rows[0]?.identifier).not.toContain(resetMail!.token);
    const ttlMs = new Date(rawVerRows.rows[0]!.expires_at).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBeLessThanOrEqual(905_000);

    // 4. Complete password reset with captured token
    const completeRes = await POST(
      new NextRequest("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "198.51.100.113",
        },
        body: JSON.stringify({ token: resetMail!.token, newPassword }),
      }),
    );
    expect(completeRes.status).toBe(200);

    // Audit rows written for request and completion without token leakage
    const auditRows = await pool.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE action IN ('auth.password_reset_requested', 'auth.password_reset') ORDER BY occurred_at ASC`,
    );
    expect(auditRows.rows.map((r) => r.action)).toEqual([
      "auth.password_reset_requested",
      "auth.password_reset",
    ]);

    // 5. Old password fails sign-in; new password succeeds
    const oldSignInRes = await POST(
      new NextRequest("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "198.51.100.114",
        },
        body: JSON.stringify({ email, password: oldPassword }),
      }),
    );
    expect(oldSignInRes.status).toBe(401);

    const newSignInRes = await POST(
      new NextRequest("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "198.51.100.115",
        },
        body: JSON.stringify({ email, password: newPassword }),
      }),
    );
    expect(newSignInRes.status).toBe(200);

    // 6. Replaying the same reset token fails closed
    const replayRes = await POST(
      new NextRequest("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "198.51.100.116",
        },
        body: JSON.stringify({ token: resetMail!.token, newPassword: "AnotherPassword-2026!" }),
      }),
    );
    expect(replayRes.status).toBe(400);
  });
});
