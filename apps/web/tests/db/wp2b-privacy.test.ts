import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getPool } from "../../src/kernel/db";
import { getCapturingTransport } from "../../src/modules/identity";
import { POST as authPost, GET as authGet } from "../../src/app/api/auth/[...all]/route";
import { GET as exportGet } from "../../src/app/api/account/export/route";
import { POST as erasureRequestPost } from "../../src/app/api/account/erasure/request/route";
import { POST as erasureConfirmPost } from "../../src/app/api/account/erasure/confirm/route";
import { DELETE as accountDelete } from "../../src/app/api/account/route";

const cacheMock = vi.hoisted(() => ({
  calls: [] as Array<{ tag: string; profile: unknown }>,
}));

vi.mock("next/cache", () => ({
  updateTag: () => undefined,
  revalidateTag: (tag: string, profile: unknown) => {
    cacheMock.calls.push({ tag, profile });
  },
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
  return single ? single.split(";")[0] ?? "" : "";
}

async function signUpAndSignIn(
  email: string,
  password: string,
  name: string,
  ip: string,
): Promise<{
  userId: string;
  cookie: string;
}> {
  const transport = getCapturingTransport();
  const signUpReq = new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-forwarded-for": ip,
    },
    body: JSON.stringify({ email, password, name }),
  });
  const signUpRes = await authPost(signUpReq);
  expect(signUpRes.status).toBe(200);
  const signUpBody = (await signUpRes.json()) as { user: { id: string } };

  const mail = transport.getLastSentEmail();
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

describe("wp2b privacy suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "DATABASE_URL must be provided when REQUIRE_DB=1 or CI=true").toBeTruthy();
    expect(DATABASE_URL).toMatch(/^postgres(ql)?:\/\//);
  });
});

describe.skipIf(!DATABASE_URL)("WP2b Data Export & Account Erasure on Real Postgres", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = getPool();
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  it("exports full user history as JSON attachment with zero cross-user leakage", async () => {
    const suffix = Date.now();
    const userAEmail = `export-a-${suffix}@example.com`;
    const userBEmail = `export-b-${suffix}@example.com`;
    const pw = "ExportPassword-2026!";

    const userA = await signUpAndSignIn(userAEmail, pw, "Author A", "198.51.100.51");
    const userB = await signUpAndSignIn(userBEmail, pw, "Author B", "198.51.100.52");

    // Seed publication, post, revision, draft, slug history, topic, and audit event for A and B
    const pubA = await pool.query<{ id: string }>(
      "INSERT INTO publications (owner_id, slug, name) VALUES ($1, $2, $3) RETURNING id",
      [userA.userId, `pub-a-${suffix}`, "Publication A"],
    );
    const pubB = await pool.query<{ id: string }>(
      "INSERT INTO publications (owner_id, slug, name) VALUES ($1, $2, $3) RETURNING id",
      [userB.userId, `pub-b-${suffix}`, "Publication B"],
    );
    await pool.query(
      "INSERT INTO publication_slug_history (publication_id, slug) VALUES ($1, $2)",
      [pubA.rows[0]!.id, `old-pub-a-${suffix}`],
    );

    const postA = await pool.query<{ id: string }>(
      "INSERT INTO posts (publication_id, slug, status) VALUES ($1, $2, 'draft') RETURNING id",
      [pubA.rows[0]!.id, `post-a-${suffix}`],
    );
    const postB = await pool.query<{ id: string }>(
      "INSERT INTO posts (publication_id, slug, status) VALUES ($1, $2, 'draft') RETURNING id",
      [pubB.rows[0]!.id, `post-b-${suffix}`],
    );

    const revA = await pool.query<{ id: string }>(
      "INSERT INTO post_revisions (post_id, title, body_markdown) VALUES ($1, $2, $3) RETURNING id",
      [postA.rows[0]!.id, "User A Title", "User A secret draft revision body"],
    );
    await pool.query(
      "INSERT INTO post_revisions (post_id, title, body_markdown) VALUES ($1, $2, $3)",
      [postB.rows[0]!.id, "User B Title", "User B private body DO NOT LEAK"],
    );
    await pool.query(
      "INSERT INTO draft_state (post_id, base_revision_id, title, body_markdown, version) VALUES ($1, $2, $3, $4, 1)",
      [postA.rows[0]!.id, revA.rows[0]!.id, "User A Unsaved Draft", "User A unsaved markdown"],
    );
    await pool.query(
      "INSERT INTO post_slug_history (post_id, slug) VALUES ($1, $2)",
      [postA.rows[0]!.id, `old-post-a-${suffix}`],
    );

    const req = new NextRequest("http://localhost:3000/api/account/export", {
      method: "GET",
      headers: {
        cookie: userA.cookie,
        "x-vercel-forwarded-for": "198.51.100.70",
      },
    });
    const res = await exportGet(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain("attachment");

    const text = await res.text();
    expect(text).not.toContain("User B private body DO NOT LEAK");
    expect(text).not.toContain(userBEmail);

    const payload = JSON.parse(text) as {
      user: { id: string; email: string };
      publications: Array<{ id: string }>;
      posts: Array<{ id: string }>;
      drafts: Array<{ postId: string; title: string }>;
      revisions: Array<{ postId: string; title: string; bodyMarkdown: string }>;
      auditEvents: Array<{ action: string }>;
    };
    expect(payload.user.id).toBe(userA.userId);
    expect(payload.user.email).toBe(userAEmail);
    expect(payload.publications.map((p) => p.id)).toEqual([pubA.rows[0]!.id]);
    expect(payload.posts.map((p) => p.id)).toEqual([postA.rows[0]!.id]);
    expect(payload.drafts).toHaveLength(1);
    expect(payload.drafts[0]?.title).toBe("User A Unsaved Draft");
    expect(payload.revisions).toHaveLength(1);
    expect(payload.revisions[0]?.bodyMarkdown).toBe("User A secret draft revision body");
    expect(payload.auditEvents.length).toBeGreaterThanOrEqual(1);

    // Second export within the same hour must be rate-limited (429)
    const secondExportRes = await exportGet(
      new NextRequest("http://localhost:3000/api/account/export", {
        method: "GET",
        headers: {
          cookie: userA.cookie,
          "x-vercel-forwarded-for": "198.51.100.70",
        },
      }),
    );
    expect(secondExportRes.status).toBe(429);
  });

  it("completes hashed-at-rest erasure token flow, hard-deletes all user rows, rejects replay, and leaves zero residue", async () => {
    const suffix = Date.now() + 1;
    const victimEmail = `erase-victim-${suffix}@example.com`;
    const survivorEmail = `erase-survivor-${suffix}@example.com`;
    const pw = "ErasePassword-2026!";

    const victim = await signUpAndSignIn(victimEmail, pw, "Victim", "198.51.100.53");
    const survivor = await signUpAndSignIn(survivorEmail, pw, "Survivor", "198.51.100.54");

    const pubVictim = await pool.query<{ id: string }>(
      "INSERT INTO publications (owner_id, slug, name) VALUES ($1, $2, $3) RETURNING id",
      [victim.userId, `victim-pub-${suffix}`, "Victim Pub"],
    );
    const pubSurvivor = await pool.query<{ id: string }>(
      "INSERT INTO publications (owner_id, slug, name) VALUES ($1, $2, $3) RETURNING id",
      [survivor.userId, `survivor-pub-${suffix}`, "Survivor Pub"],
    );
    const postVictim = await pool.query<{ id: string }>(
      "INSERT INTO posts (publication_id, slug, status) VALUES ($1, $2, 'draft') RETURNING id",
      [pubVictim.rows[0]!.id, `victim-post-${suffix}`],
    );
    const revVictim = await pool.query<{ id: string }>(
      "INSERT INTO post_revisions (post_id, title, body_markdown) VALUES ($1, $2, $3) RETURNING id",
      [postVictim.rows[0]!.id, "Victim Title", "Victim markdown body"],
    );
    await pool.query(
      `UPDATE posts SET status = 'published', published_revision_id = $2, published_at = now() WHERE id = $1`,
      [postVictim.rows[0]!.id, revVictim.rows[0]!.id],
    );
    await pool.query(
      "INSERT INTO draft_state (post_id, base_revision_id, title, body_markdown) VALUES ($1, $2, $3, $4)",
      [postVictim.rows[0]!.id, revVictim.rows[0]!.id, "Victim Draft", "Victim draft body"],
    );
    await pool.query(
      "INSERT INTO post_slug_history (post_id, slug) VALUES ($1, $2)",
      [postVictim.rows[0]!.id, `victim-old-${suffix}`],
    );
    await pool.query(
      "INSERT INTO publication_slug_history (publication_id, slug) VALUES ($1, $2)",
      [pubVictim.rows[0]!.id, `victim-pub-old-${suffix}`],
    );

    // 0. Reject missing or wrong password on credential account before issuing erasure token
    const missingPwRes = await erasureRequestPost(
      new NextRequest("http://localhost:3000/api/account/erasure/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: victim.cookie,
          "x-vercel-forwarded-for": "198.51.100.88",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(missingPwRes.status).toBe(400);

    const wrongPwRes = await erasureRequestPost(
      new NextRequest("http://localhost:3000/api/account/erasure/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: victim.cookie,
          "x-vercel-forwarded-for": "198.51.100.88",
        },
        body: JSON.stringify({ password: "WrongPassword-999!" }),
      }),
    );
    expect(wrongPwRes.status).toBe(403);

    // 1. Request erasure & inspect logs + DB token hashing
    const logSpy = vi.spyOn(console, "log");
    const transport = getCapturingTransport();
    transport.clear();

    const reqErasure = new NextRequest("http://localhost:3000/api/account/erasure/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: victim.cookie,
        "x-vercel-forwarded-for": "198.51.100.88",
      },
      body: JSON.stringify({ password: pw }),
    });
    const reqRes = await erasureRequestPost(reqErasure);
    expect(reqRes.status).toBe(202);

    const erasureMail = transport.getLastSentEmail();
    expect(erasureMail).toBeDefined();
    expect(erasureMail?.type).toBe("erasure_confirmation");
    expect(erasureMail?.to).toBe(victimEmail);
    const rawToken = erasureMail!.token;
    expect(rawToken.length).toBeGreaterThanOrEqual(32);

    // Verify plaintext token and email NEVER appeared in console logs
    const loggedText = logSpy.mock.calls.flat().map(String).join("\n");
    logSpy.mockRestore();
    expect(loggedText).not.toContain(rawToken);
    expect(loggedText).not.toContain(victimEmail);

    // Verify DB stores SHA-256 hash at rest, never the raw token
    const expectedHash = createHash("sha256").update(rawToken).digest("hex");
    const verRows = await pool.query<{ value: string }>(
      "SELECT value FROM verifications WHERE identifier = $1",
      [`account-erasure:${victim.userId}`],
    );
    expect(verRows.rows).toHaveLength(1);
    expect(verRows.rows[0]?.value).toBe(expectedHash);
    expect(verRows.rows[0]?.value).not.toBe(rawToken);

    // 2. Reject invalid token
    const badConfirm = await erasureConfirmPost(
      new NextRequest("http://localhost:3000/api/account/erasure/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: victim.cookie,
          "x-vercel-forwarded-for": "198.51.100.88",
        },
        body: JSON.stringify({ token: "wrong-token-value-12345" }),
      }),
    );
    expect(badConfirm.status).toBe(403);

    // 3. Reject expired token (simulate expiry check cleanly on a temporary expired row check)
    await pool.query(
      "UPDATE verifications SET expires_at = now() - interval '1 minute' WHERE identifier = $1",
      [`account-erasure:${victim.userId}`],
    );
    const expiredConfirm = await erasureConfirmPost(
      new NextRequest("http://localhost:3000/api/account/erasure/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: victim.cookie,
          "x-vercel-forwarded-for": "198.51.100.88",
        },
        body: JSON.stringify({ token: rawToken }),
      }),
    );
    expect(expiredConfirm.status).toBe(410);

    // Request fresh token for actual confirmation
    transport.clear();
    const reqFresh = await erasureRequestPost(
      new NextRequest("http://localhost:3000/api/account/erasure/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: victim.cookie,
          "x-vercel-forwarded-for": "198.51.100.88",
        },
        body: JSON.stringify({ password: pw }),
      }),
    );
    expect(reqFresh.status).toBe(202);
    const freshToken = transport.getLastSentEmail()!.token;

    // 4. Confirm erasure via DELETE /api/account (hard delete in single transaction)
    cacheMock.calls.length = 0;
    const confirmRes = await accountDelete(
      new NextRequest("http://localhost:3000/api/account", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie: victim.cookie,
          "x-vercel-forwarded-for": "198.51.100.88",
        },
        body: JSON.stringify({ token: freshToken }),
      }),
    );
    expect(confirmRes.status).toBe(200);

    // Verify WP4 cache tags were invalidated after transaction commit
    const invalidatedTags = cacheMock.calls.map((c) => c.tag);
    expect(invalidatedTags).toContain(`publication:victim-pub-${suffix}`);
    expect(invalidatedTags).toContain(`publication-feed:victim-pub-${suffix}`);
    expect(invalidatedTags).toContain(`post:victim-pub-${suffix}:victim-post-${suffix}`);
    expect(invalidatedTags).toContain(`post-id:${postVictim.rows[0]!.id}`);
    const confirmBody = (await confirmRes.json()) as {
      erased: boolean;
      deletedCounts: Record<string, number>;
    };
    expect(confirmBody.erased).toBe(true);
    expect(confirmBody.deletedCounts.users).toBe(1);
    expect(confirmBody.deletedCounts.publications).toBe(1);
    expect(confirmBody.deletedCounts.posts).toBe(1);
    expect(confirmBody.deletedCounts.postRevisions).toBe(1);
    expect(confirmBody.deletedCounts.draftState).toBe(1);
    expect(confirmBody.deletedCounts.sessions).toBeGreaterThanOrEqual(1);
    expect(confirmBody.deletedCounts.accounts).toBeGreaterThanOrEqual(1);

    // 5. Prove zero residue for victim across every table
    const victimQueries: Array<[string, unknown[]]> = [
      ["SELECT count(*)::int AS c FROM users WHERE id = $1", [victim.userId]],
      ["SELECT count(*)::int AS c FROM sessions WHERE user_id = $1", [victim.userId]],
      ["SELECT count(*)::int AS c FROM accounts WHERE user_id = $1", [victim.userId]],
      ["SELECT count(*)::int AS c FROM verifications WHERE identifier = $1", [`account-erasure:${victim.userId}`]],
      ["SELECT count(*)::int AS c FROM publications WHERE owner_id = $1", [victim.userId]],
      ["SELECT count(*)::int AS c FROM posts WHERE id = $1", [postVictim.rows[0]!.id]],
      ["SELECT count(*)::int AS c FROM post_revisions WHERE post_id = $1", [postVictim.rows[0]!.id]],
      ["SELECT count(*)::int AS c FROM draft_state WHERE post_id = $1", [postVictim.rows[0]!.id]],
      ["SELECT count(*)::int AS c FROM post_slug_history WHERE post_id = $1", [postVictim.rows[0]!.id]],
      ["SELECT count(*)::int AS c FROM publication_slug_history WHERE publication_id = $1", [pubVictim.rows[0]!.id]],
      ["SELECT count(*)::int AS c FROM audit_events WHERE actor_user_id = $1 OR subject_user_id = $1", [victim.userId]],
    ];
    for (const [sqlText, params] of victimQueries) {
      const r = await pool.query<{ c: number }>(sqlText, params);
      expect(r.rows[0]?.c, `Zero residue check failed for: ${sqlText}`).toBe(0);
    }

    // 6. Token replay is rejected (401 because session was also cascaded/erased)
    const replayRes = await erasureConfirmPost(
      new NextRequest("http://localhost:3000/api/account/erasure/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: victim.cookie,
          "x-vercel-forwarded-for": "198.51.100.88",
        },
        body: JSON.stringify({ token: freshToken }),
      }),
    );
    expect([401, 403]).toContain(replayRes.status);

    // 7. Survivor's data remains intact
    const survivorPubCheck = await pool.query<{ id: string }>(
      "SELECT id FROM publications WHERE id = $1",
      [pubSurvivor.rows[0]!.id],
    );
    expect(survivorPubCheck.rows).toHaveLength(1);
  });
});
