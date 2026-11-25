import { NextRequest } from "next/server";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getPool } from "../../src/kernel/db";
import { getCapturingTransport } from "../../src/modules/identity";
import { GET as authGet, POST as authPost } from "../../src/app/api/auth/[...all]/route";
import { POST as publicationsPost } from "../../src/app/api/publications/route";
import { POST as postsPost } from "../../src/app/api/posts/route";
import { PUT as draftPut } from "../../src/app/api/posts/[id]/draft/route";
import { GET as searchGet } from "../../src/app/api/search/route";
import { GET as exportGet } from "../../src/app/api/account/export/route";
import { POST as erasureRequestPost } from "../../src/app/api/account/erasure/request/route";
import { DELETE as accountDelete } from "../../src/app/api/account/route";

vi.mock("next/cache", () => ({
  updateTag: () => undefined,
  revalidateTag: () => undefined,
  cacheTag: () => undefined,
  cacheLife: () => undefined,
}));

const DATABASE_URL = process.env.DATABASE_URL?.trim() || undefined;
const REQUIRED =
  process.env.REQUIRE_DB === "1" ||
  process.env.CI === "true" ||
  process.env.REQUIRE_DATABASE === "1";

function extractCookieHeader(res: Response): string {
  const setCookies =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [];
  if (setCookies.length > 0) {
    return setCookies.map((c) => c.split(";")[0]).join("; ");
  }
  const single = res.headers.get("set-cookie");
  return single ? (single.split(";")[0] ?? "") : "";
}

function assertNoStackTrace(bodyText: string): void {
  expect(bodyText).not.toMatch(/\bat\s+\S+\s+\(/);
  expect(bodyText).not.toContain("node_modules");
  expect(bodyText).not.toMatch(/select\s+["\w].*\s+from\s+/i);
}

async function signUpAndSignIn(
  email: string,
  password: string,
  name: string,
  ip: string,
): Promise<{ userId: string; cookie: string }> {
  const transport = getCapturingTransport();
  transport.clear();

  const signUpRes = await authPost(
    new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-forwarded-for": ip,
      },
      body: JSON.stringify({ email, password, name }),
    }),
  );
  expect(signUpRes.status).toBe(200);
  const signUpBody = (await signUpRes.json()) as { user: { id: string } };

  const mail = transport.getLastSentEmail();
  expect(mail?.type).toBe("verification");
  expect(mail?.to).toBe(email);

  const verifyRes = await authGet(
    new NextRequest(mail!.url, {
      method: "GET",
      headers: { "x-vercel-forwarded-for": ip },
    }),
  );
  expect([200, 302]).toContain(verifyRes.status);

  const signInRes = await authPost(
    new NextRequest("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-forwarded-for": ip,
      },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(signInRes.status).toBe(200);

  return {
    userId: signUpBody.user.id,
    cookie: extractCookieHeader(signInRes),
  };
}

describe("wp8 security break suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "DATABASE_URL must be provided when REQUIRE_DB=1 or CI=true").toBeTruthy();
    expect(DATABASE_URL).toMatch(/^postgres(ql)?:\/\//);
  });
});

describe.skipIf(!DATABASE_URL)("WP8 Security Break Suite (Real Postgres Attack Proofs)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = getPool();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("Layer 19: rejects hostile redirectTo targets on POST /api/auth/request-password-reset without emitting untrusted links", async () => {
    const suffix = `${Date.now()}-l19`;
    const email = `wp8-redirect-${suffix}@example.com`;
    const password = "ValidPassword-2026!";

    await signUpAndSignIn(email, password, "Redirect Target User", "198.51.100.141");

    const hostileTargets = [
      "https://evil.example/steal",
      "//evil.example",
      "javascript:alert(1)",
    ];

    const transport = getCapturingTransport();
    for (let i = 0; i < hostileTargets.length; i++) {
      const redirectTo = hostileTargets[i]!;
      transport.clear();

      const res = await authPost(
        new NextRequest("http://localhost:3000/api/auth/request-password-reset", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-vercel-forwarded-for": `198.51.100.${142 + i}`,
          },
          body: JSON.stringify({ email, redirectTo }),
        }),
      );
      const bodyText = await res.text();
      expect(res.status).toBeLessThan(500);
      assertNoStackTrace(bodyText);

      const sent = transport.getLastSentEmail();
      if (res.status < 400 && sent) {
        const parsed = new URL(sent.url);
        expect(parsed.origin).toBe("http://localhost:3000");
        const callbackUrl = parsed.searchParams.get("callbackURL") ?? parsed.searchParams.get("redirectTo");
        if (callbackUrl !== null) {
          expect(callbackUrl).not.toContain("evil.example");
          expect(callbackUrl.toLowerCase()).not.toContain("javascript:");
          expect(callbackUrl.startsWith("//")).toBe(false);
        }
      }
    }
  });

  it("Layer 14 & 22: enforces persistent 429 rate-limit fail-closed on POST /api/auth/sign-in/email abuse", async () => {
    const suffix = `${Date.now()}-l14`;
    const pinnedIp = "198.51.100.155";
    const targetEmail = `wp8-bruteforce-${suffix}@example.com`;
    const statuses: number[] = [];
    let limitedBody = "";

    for (let attempt = 1; attempt <= 7; attempt++) {
      const res = await authPost(
        new NextRequest("http://localhost:3000/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-vercel-forwarded-for": pinnedIp,
            "x-forwarded-for": `203.0.113.${attempt}`,
          },
          body: JSON.stringify({
            email: targetEmail,
            password: `WrongPassword-${attempt}!`,
          }),
        }),
      );
      statuses.push(res.status);
      if (res.status === 429) {
        limitedBody = await res.text();
      } else {
        await res.arrayBuffer();
      }
      expect(res.status).toBeLessThan(500);
    }

    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(statuses[6]).toBe(429);
    expect(limitedBody.length).toBeGreaterThan(0);
    assertNoStackTrace(limitedBody);
  });

  it("Layer 16: rejects oversized bodies & hostile input on publications, drafts, and search, and safely handles hostile strings in export", async () => {
    const suffix = `${Date.now()}-l16`;
    const email = `wp8-payload-${suffix}@example.com`;
    const password = "PayloadPassword-2026!";
    const hostileDisplayName = `User <script>alert(1)</script> "' ; DROP TABLE users;--`;

    const actor = await signUpAndSignIn(email, password, hostileDisplayName, "198.51.100.160");

    // Seed a valid publication and draft post first
    const validPubRes = await publicationsPost(
      new NextRequest("http://localhost:3000/api/publications", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: actor.cookie,
          "x-vercel-forwarded-for": "198.51.100.160",
        },
        body: JSON.stringify({
          name: `Pub <img onerror=alert(1)> ${suffix}`,
          slug: `wp8-pub-${suffix}`,
        }),
      }),
    );
    expect(validPubRes.status).toBe(201);
    const createdPub = (await validPubRes.json()) as { id: string };

    const validPostRes = await postsPost(
      new NextRequest("http://localhost:3000/api/posts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: actor.cookie,
          "x-vercel-forwarded-for": "198.51.100.160",
        },
        body: JSON.stringify({
          publicationId: createdPub.id,
          slug: `wp8-post-${suffix}`,
        }),
      }),
    );
    expect(validPostRes.status).toBe(201);
    const createdPost = (await validPostRes.json()) as { id: string; slug: string };
    const initialVersion = 0;

    // 1. Publication boundary attacks (oversized body, oversized fields, control/traversal slugs)
    const pubPayloads = [
      JSON.stringify({ name: "x".repeat(1_500_000), slug: `big-${suffix}` }),
      JSON.stringify({ name: "A".repeat(81), slug: `long-${suffix}` }),
      JSON.stringify({ name: "Valid Name", slug: "../etc/passwd" }),
      JSON.stringify({ name: "Valid Name", slug: "bad\u0000slug" }),
      JSON.stringify({ name: "Valid Name", slug: "UPPERCASE" }),
      JSON.stringify({ name: "Valid Name", slug: "api" }),
    ];

    for (const rawBody of pubPayloads) {
      const res = await publicationsPost(
        new NextRequest("http://localhost:3000/api/publications", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: actor.cookie,
            "x-vercel-forwarded-for": "198.51.100.160",
          },
          body: rawBody,
        }),
      );
      const text = await res.text();
      expect([400, 413]).toContain(res.status);
      assertNoStackTrace(text);
    }

    // 2. Draft save boundary attacks (oversized markdown > 1.5MB, >102,400 bytes, >200 title, newline in title)
    const draftPayloads = [
      JSON.stringify({ expectedVersion: initialVersion, title: "Too Big", bodyMarkdown: "m".repeat(1_500_000) }),
      JSON.stringify({ expectedVersion: initialVersion, title: "Over 100KB", bodyMarkdown: "b".repeat(102_401) }),
      JSON.stringify({ expectedVersion: initialVersion, title: "T".repeat(201), bodyMarkdown: "ok" }),
      JSON.stringify({ expectedVersion: initialVersion, title: "Line\nBreak", bodyMarkdown: "ok" }),
      JSON.stringify({ expectedVersion: initialVersion, title: "Control\u0000Title", bodyMarkdown: "ok" }),
    ];

    for (const rawBody of draftPayloads) {
      const res = await draftPut(
        new NextRequest(`http://localhost:3000/api/posts/${createdPost.id}/draft`, {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            cookie: actor.cookie,
            "x-vercel-forwarded-for": "198.51.100.160",
          },
          body: rawBody,
        }),
        { params: Promise.resolve({ id: createdPost.id }) },
      );
      const text = await res.text();
      expect([400, 413]).toContain(res.status);
      assertNoStackTrace(text);
    }

    // 3. Search query & topic filter attacks (control chars, oversized q, bad slug, out-of-bounds limit)
    const searchAttacks = [
      "http://localhost:3000/api/search?q=hello%00world",
      "http://localhost:3000/api/search?q=bell%07test",
      `http://localhost:3000/api/search?q=${"s".repeat(101)}`,
      "http://localhost:3000/api/search?q=valid&topic=../admin",
      "http://localhost:3000/api/search?q=valid&topic=bad%00topic",
      "http://localhost:3000/api/search?q=valid&limit=9999",
    ];

    for (const url of searchAttacks) {
      const res = await searchGet(new NextRequest(url, { method: "GET" }));
      const text = await res.text();
      expect([400, 413]).toContain(res.status);
      assertNoStackTrace(text);
    }

    // 4. Export JSON escaping & safety for hostile user/pub/draft content
    const hostileDraftTitle = `Title <script>alert(1)</script> & "' ; DROP TABLE posts;--`;
    const hostileDraftBody = `Body <img src=x onerror=alert(1)> \\n "quoted" ' OR 1=1 --`;
    const validSaveRes = await draftPut(
      new NextRequest(`http://localhost:3000/api/posts/${createdPost.id}/draft`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: actor.cookie,
          "x-vercel-forwarded-for": "198.51.100.160",
        },
        body: JSON.stringify({
          expectedVersion: initialVersion,
          title: hostileDraftTitle,
          bodyMarkdown: hostileDraftBody,
        }),
      }),
      { params: Promise.resolve({ id: createdPost.id }) },
    );
    expect(validSaveRes.status).toBe(200);

    const exportRes = await exportGet(
      new NextRequest("http://localhost:3000/api/account/export", {
        method: "GET",
        headers: {
          cookie: actor.cookie,
          "x-vercel-forwarded-for": "198.51.100.160",
        },
      }),
    );
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get("content-type")).toContain("application/json");
    expect(exportRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(exportRes.headers.get("cache-control")).toContain("no-store");

    const exportRaw = await exportRes.text();
    const parsedExport = JSON.parse(exportRaw) as {
      user: { name: string };
      drafts: Array<{ title: string; bodyMarkdown: string }>;
    };
    expect(parsedExport.user.name).toBe(hostileDisplayName);
    expect(parsedExport.drafts[0]?.title).toBe(hostileDraftTitle);
    expect(parsedExport.drafts[0]?.bodyMarkdown).toBe(hostileDraftBody);
    expect(exportRaw).not.toContain(password);
  });

  it("Layer 15 & 31: verifies direct DELETE /api/account erasure, cross-user token rejection, and replay refusal", async () => {
    const suffix = `${Date.now()}-l15`;
    const victimEmail = `wp8-victim-${suffix}@example.com`;
    const attackerEmail = `wp8-attacker-${suffix}@example.com`;
    const password = "DeleteMeSafely-2026!";

    const victim = await signUpAndSignIn(victimEmail, password, "Victim Author", "198.51.100.171");
    const attacker = await signUpAndSignIn(attackerEmail, password, "Attacker Author", "198.51.100.172");

    // Seed publication & post so cascade deletion covers owned content
    const pubRes = await publicationsPost(
      new NextRequest("http://localhost:3000/api/publications", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: victim.cookie,
          "x-vercel-forwarded-for": "198.51.100.171",
        },
        body: JSON.stringify({ name: `Victim Pub ${suffix}`, slug: `wp8-victim-${suffix}` }),
      }),
    );
    expect(pubRes.status).toBe(201);
    const pub = (await pubRes.json()) as { id: string };

    const postRes = await postsPost(
      new NextRequest("http://localhost:3000/api/posts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: victim.cookie,
          "x-vercel-forwarded-for": "198.51.100.171",
        },
        body: JSON.stringify({ publicationId: pub.id, slug: `wp8-victim-post-${suffix}` }),
      }),
    );
    expect(postRes.status).toBe(201);

    // 1. Unauthenticated DELETE /api/account must fail closed with 401
    const unauthRes = await accountDelete(
      new NextRequest("http://localhost:3000/api/account", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-vercel-forwarded-for": "198.51.100.173",
        },
        body: JSON.stringify({ token: "any-token" }),
      }),
    );
    expect(unauthRes.status).toBe(401);

    // 2. Request erasure for victim and capture raw confirmation token
    const transport = getCapturingTransport();
    transport.clear();

    const reqRes = await erasureRequestPost(
      new NextRequest("http://localhost:3000/api/account/erasure/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: victim.cookie,
          "x-vercel-forwarded-for": "198.51.100.171",
        },
        body: JSON.stringify({ password }),
      }),
    );
    expect(reqRes.status).toBe(202);
    const mail = transport.getLastSentEmail();
    expect(mail?.type).toBe("erasure_confirmation");
    const rawToken = mail!.token;

    // 3. Cross-user attack: attacker tries victim's token via DELETE /api/account
    const wrongUserRes = await accountDelete(
      new NextRequest("http://localhost:3000/api/account", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie: attacker.cookie,
          "x-vercel-forwarded-for": "198.51.100.172",
        },
        body: JSON.stringify({ token: rawToken }),
      }),
    );
    expect([401, 403, 404]).toContain(wrongUserRes.status);

    // Victim must still exist intact
    const victimStillHere = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE id = $1",
      [victim.userId],
    );
    expect(victimStillHere.rows).toHaveLength(1);

    // 4. Valid direct DELETE /api/account deletes victim + cascaded rows
    const deleteRes = await accountDelete(
      new NextRequest("http://localhost:3000/api/account", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie: victim.cookie,
          "x-vercel-forwarded-for": "198.51.100.171",
        },
        body: JSON.stringify({ token: rawToken }),
      }),
    );
    expect(deleteRes.status).toBe(200);
    const deleteBody = (await deleteRes.json()) as {
      erased?: boolean;
      deletedCounts?: { publications: number; posts: number };
    };
    expect(deleteBody.erased).toBe(true);
    expect(deleteBody.deletedCounts?.publications).toBe(1);
    expect(deleteBody.deletedCounts?.posts).toBe(1);

    const userCount = await pool.query<{ c: number }>(
      "SELECT count(*)::int AS c FROM users WHERE id = $1",
      [victim.userId],
    );
    const sessionCount = await pool.query<{ c: number }>(
      "SELECT count(*)::int AS c FROM sessions WHERE user_id = $1",
      [victim.userId],
    );
    const accountCount = await pool.query<{ c: number }>(
      "SELECT count(*)::int AS c FROM accounts WHERE user_id = $1",
      [victim.userId],
    );
    const pubCount = await pool.query<{ c: number }>(
      "SELECT count(*)::int AS c FROM publications WHERE owner_id = $1",
      [victim.userId],
    );
    const tokenCount = await pool.query<{ c: number }>(
      "SELECT count(*)::int AS c FROM verifications WHERE identifier = $1",
      [`account-erasure:${victim.userId}`],
    );

    expect(userCount.rows[0]?.c).toBe(0);
    expect(sessionCount.rows[0]?.c).toBe(0);
    expect(accountCount.rows[0]?.c).toBe(0);
    expect(pubCount.rows[0]?.c).toBe(0);
    expect(tokenCount.rows[0]?.c).toBe(0);

    // 5. Token/session replay against DELETE /api/account must fail closed
    const replayRes = await accountDelete(
      new NextRequest("http://localhost:3000/api/account", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie: victim.cookie,
          "x-vercel-forwarded-for": "198.51.100.171",
        },
        body: JSON.stringify({ token: rawToken }),
      }),
    );
    expect([401, 403, 404]).toContain(replayRes.status);
  });
});
