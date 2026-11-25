import { NextRequest } from "next/server";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb, getPool } from "../../src/kernel/db";
import { getCapturingTransport } from "../../src/modules/identity";
import { seedTopics } from "../../src/modules/topics";
import { POST as authPost, GET as authGet } from "../../src/app/api/auth/[...all]/route";
import { POST as publicationsPost } from "../../src/app/api/publications/route";
import { POST as postsPost } from "../../src/app/api/posts/route";
import { PUT as draftPut } from "../../src/app/api/posts/[id]/draft/route";
import { POST as publishPost } from "../../src/app/api/posts/[id]/publish/route";
import { POST as deletePost } from "../../src/app/api/posts/[id]/delete/route";
import { PUT as topicsPut } from "../../src/app/api/posts/[id]/topics/route";
import { POST as erasureRequestPost } from "../../src/app/api/account/erasure/request/route";
import { POST as erasureConfirmPost } from "../../src/app/api/account/erasure/confirm/route";
import {
  loadDashboardData,
  loadStudioPostData,
} from "../../src/components/studio/server-data";

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
  return single ? single.split(";")[0] ?? "" : "";
}

async function signUpAndSignIn(
  email: string,
  password: string,
  name: string,
  ip: string,
): Promise<{ userId: string; cookie: string }> {
  const transport = getCapturingTransport();
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

describe("wp8 concurrency and studio loaders suite environment", () => {
  it("fails instead of skipping when CI or REQUIRE_DB claims to run it", () => {
    if (!REQUIRED) return;
    expect(
      DATABASE_URL,
      "DATABASE_URL must be provided when REQUIRE_DB=1 or CI=true",
    ).toBeTruthy();
    expect(DATABASE_URL).toMatch(/^postgres(ql)?:\/\//);
  });
});

describe.skipIf(!DATABASE_URL)(
  "WP8 T2 Concurrency Races & Studio Server-Data Isolation on Real Postgres",
  () => {
    let pool: Pool;

    beforeAll(() => {
      pool = getPool();
    });

    afterAll(async () => {
      await closeDb();
    });

    it(
      "Race 1: allows exactly 1 winner out of 10 parallel publication handle claims",
      { timeout: 60_000 },
      async () => {
        const tag = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
        const sharedHandle = `race-handle-${tag}`;
        const pw = "RaceHandlePass-2026!";

        const users: Array<{ userId: string; cookie: string }> = [];
        for (let i = 0; i < 10; i += 1) {
          const user = await signUpAndSignIn(
            `race-pub-${tag}-${i}@example.com`,
            pw,
            `Writer ${i}`,
            `198.51.103.${10 + i}`,
          );
          users.push(user);
        }

        const responses = await Promise.all(
          users.map((user, idx) =>
            publicationsPost(
              new NextRequest("http://localhost:3000/api/publications", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  cookie: user.cookie,
                  "x-request-id": `race-pub-${tag}-${idx}`,
                },
                body: JSON.stringify({
                  name: `Parallel Pub ${idx}`,
                  slug: sharedHandle,
                }),
              }),
            ),
          ),
        );

        const statuses = responses.map((res) => res.status);
        const createdCount = statuses.filter((s) => s === 201).length;
        const conflictCount = statuses.filter((s) => s === 409).length;
        const serverErrorCount = statuses.filter((s) => s >= 500).length;

        expect(serverErrorCount).toBe(0);
        expect(createdCount).toBe(1);
        expect(conflictCount).toBe(9);

        const dbRows = await pool.query<{ id: string }>(
          "SELECT id FROM publications WHERE slug = $1",
          [sharedHandle],
        );
        expect(dbRows.rows).toHaveLength(1);
      },
    );

    it(
      "Race 2: enforces CAS version locking across 6 parallel PUT draft saves",
      { timeout: 60_000 },
      async () => {
        const tag = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
        const writer = await signUpAndSignIn(
          `race-draft-${tag}@example.com`,
          "RaceDraftPass-2026!",
          "Draft Writer",
          "198.51.104.11",
        );

        const pubRes = await publicationsPost(
          new NextRequest("http://localhost:3000/api/publications", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: writer.cookie,
            },
            body: JSON.stringify({
              name: `Draft Pub ${tag}`,
              slug: `draft-pub-${tag}`,
            }),
          }),
        );
        expect(pubRes.status).toBe(201);
        const pub = (await pubRes.json()) as { id: string };

        const postRes = await postsPost(
          new NextRequest("http://localhost:3000/api/posts", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: writer.cookie,
            },
            body: JSON.stringify({ publicationId: pub.id }),
          }),
        );
        expect(postRes.status).toBe(201);
        const createdPost = (await postRes.json()) as { id: string };

        // Save v0 -> v1 first so optimistic locking competes on existing draft row.
        const initSave = await draftPut(
          new NextRequest(
            `http://localhost:3000/api/posts/${createdPost.id}/draft`,
            {
              method: "PUT",
              headers: {
                "content-type": "application/json",
                cookie: writer.cookie,
              },
              body: JSON.stringify({
                expectedVersion: 0,
                title: "Initial Draft",
                bodyMarkdown: "Initial body content.",
              }),
            },
          ),
          { params: Promise.resolve({ id: createdPost.id }) },
        );
        expect(initSave.status).toBe(200);
        const initBody = (await initSave.json()) as { version: number };
        expect(initBody.version).toBe(1);

        const raceResponses = await Promise.all(
          Array.from({ length: 6 }, (_, idx) =>
            draftPut(
              new NextRequest(
                `http://localhost:3000/api/posts/${createdPost.id}/draft`,
                {
                  method: "PUT",
                  headers: {
                    "content-type": "application/json",
                    cookie: writer.cookie,
                    "x-request-id": `race-draft-${tag}-${idx}`,
                  },
                  body: JSON.stringify({
                    expectedVersion: 1,
                    title: `Competing Save ${idx}`,
                    bodyMarkdown: `Body from writer call ${idx}`,
                  }),
                },
              ),
              { params: Promise.resolve({ id: createdPost.id }) },
            ),
          ),
        );

        const statuses = raceResponses.map((r) => r.status);
        const okResponses = raceResponses.filter((r) => r.status === 200);
        const conflictResponses = raceResponses.filter((r) => r.status === 409);

        expect(statuses.filter((s) => s >= 500)).toHaveLength(0);
        expect(okResponses).toHaveLength(1);
        expect(conflictResponses).toHaveLength(5);

        const winnerPayload = (await okResponses[0]!.json()) as {
          version: number;
        };
        expect(winnerPayload.version).toBe(2);

        const draftRow = await pool.query<{ version: number; title: string }>(
          "SELECT version, title FROM draft_state WHERE post_id = $1",
          [createdPost.id],
        );
        expect(draftRow.rows).toHaveLength(1);
        expect(draftRow.rows[0]?.version).toBe(2);
      },
    );

    it(
      "Race 3: enforces exactly-once publish transitions and single-use concurrent erasure",
      { timeout: 60_000 },
      async () => {
        const tag = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
        const pw = "RaceLifecyclePass-2026!";
        const writer = await signUpAndSignIn(
          `race-life-${tag}@example.com`,
          pw,
          "Lifecycle Writer",
          "198.51.105.12",
        );

        const pubRes = await publicationsPost(
          new NextRequest("http://localhost:3000/api/publications", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: writer.cookie,
            },
            body: JSON.stringify({
              name: `Life Pub ${tag}`,
              slug: `life-pub-${tag}`,
            }),
          }),
        );
        expect(pubRes.status).toBe(201);
        const pub = (await pubRes.json()) as { id: string };

        const postRes = await postsPost(
          new NextRequest("http://localhost:3000/api/posts", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: writer.cookie,
            },
            body: JSON.stringify({ publicationId: pub.id }),
          }),
        );
        expect(postRes.status).toBe(201);
        const createdPost = (await postRes.json()) as { id: string };

        const draftRes = await draftPut(
          new NextRequest(
            `http://localhost:3000/api/posts/${createdPost.id}/draft`,
            {
              method: "PUT",
              headers: {
                "content-type": "application/json",
                cookie: writer.cookie,
              },
              body: JSON.stringify({
                expectedVersion: 0,
                title: "Publish Race Title",
                bodyMarkdown: "Publish race body markdown.",
              }),
            },
          ),
          { params: Promise.resolve({ id: createdPost.id }) },
        );
        expect(draftRes.status).toBe(200);

        // Concurrent publish with distinct requestIds and same expectedVersion (1).
        const publishResponses = await Promise.all(
          Array.from({ length: 5 }, (_, idx) =>
            publishPost(
              new NextRequest(
                `http://localhost:3000/api/posts/${createdPost.id}/publish`,
                {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    cookie: writer.cookie,
                    "x-request-id": `race-pub-act-${tag}-${idx}`,
                  },
                  body: JSON.stringify({ expectedVersion: 1 }),
                },
              ),
              { params: Promise.resolve({ id: createdPost.id }) },
            ),
          ),
        );

        const pubStatuses = publishResponses.map((r) => r.status);
        expect(pubStatuses.filter((s) => s >= 500)).toHaveLength(0);
        expect(pubStatuses.filter((s) => s === 200)).toHaveLength(1);
        expect(pubStatuses.filter((s) => s === 409)).toHaveLength(4);

        const publishAuditRows = await pool.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM audit_events WHERE target_id = $1 AND action = 'post.published'",
          [createdPost.id],
        );
        expect(Number(publishAuditRows.rows[0]?.count)).toBe(1);

        // Concurrent account erasure confirm with the same valid single-use token.
        const transport = getCapturingTransport();
        transport.clear();

        const reqErasure = await erasureRequestPost(
          new NextRequest("http://localhost:3000/api/account/erasure/request", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: writer.cookie,
              "x-vercel-forwarded-for": "198.51.105.12",
            },
            body: JSON.stringify({ password: pw }),
          }),
        );
        expect(reqErasure.status).toBe(202);
        const rawToken = transport.getLastSentEmail()!.token;

        const erasureResponses = await Promise.all(
          Array.from({ length: 5 }, (_, idx) =>
            erasureConfirmPost(
              new NextRequest(
                "http://localhost:3000/api/account/erasure/confirm",
                {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    cookie: writer.cookie,
                    "x-vercel-forwarded-for": "198.51.105.12",
                    "x-request-id": `race-erase-${tag}-${idx}`,
                  },
                  body: JSON.stringify({ token: rawToken }),
                },
              ),
            ),
          ),
        );

        const eraseStatuses = erasureResponses.map((r) => r.status);
        expect(eraseStatuses.filter((s) => s >= 500)).toHaveLength(0);
        expect(eraseStatuses.filter((s) => s === 200)).toHaveLength(1);
        expect(
          eraseStatuses.filter((s) => s === 401 || s === 403),
        ).toHaveLength(4);

        const userAfter = await pool.query<{ id: string }>(
          "SELECT id FROM users WHERE id = $1",
          [writer.userId],
        );
        expect(userAfter.rows).toHaveLength(0);

        const erasedPostAfter = await pool.query<{ id: string }>(
          "SELECT id FROM posts WHERE id = $1",
          [createdPost.id],
        );
        expect(erasedPostAfter.rows).toHaveLength(0);
      },
    );

    it(
      "Server loaders isolate dashboard & studio data between User A (owner) and User B (stranger)",
      { timeout: 60_000 },
      async () => {
        const tag = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
        await seedTopics({ kind: "db", db: getDb() });

        const userA = await signUpAndSignIn(
          `loader-a-${tag}@example.com`,
          "LoaderPassA-2026!",
          "User A",
          "198.51.106.21",
        );
        const userB = await signUpAndSignIn(
          `loader-b-${tag}@example.com`,
          "LoaderPassB-2026!",
          "User B",
          "198.51.106.22",
        );

        // User A creates 1 publication
        const pubRes = await publicationsPost(
          new NextRequest("http://localhost:3000/api/publications", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: userA.cookie,
            },
            body: JSON.stringify({
              name: `Owner Pub ${tag}`,
              slug: `owner-pub-${tag}`,
            }),
          }),
        );
        expect(pubRes.status).toBe(201);
        const pubA = (await pubRes.json()) as { id: string; slug: string };

        // Post 1: Draft
        const draftCreate = await postsPost(
          new NextRequest("http://localhost:3000/api/posts", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: userA.cookie,
            },
            body: JSON.stringify({ publicationId: pubA.id, slug: `draft-${tag}` }),
          }),
        );
        const draftPost = (await draftCreate.json()) as { id: string };
        await draftPut(
          new NextRequest(
            `http://localhost:3000/api/posts/${draftPost.id}/draft`,
            {
              method: "PUT",
              headers: {
                "content-type": "application/json",
                cookie: userA.cookie,
              },
              body: JSON.stringify({
                expectedVersion: 0,
                title: "User A Secret Draft Title",
                bodyMarkdown: "User A secret unpublished markdown body",
              }),
            },
          ),
          { params: Promise.resolve({ id: draftPost.id }) },
        );

        // Post 2: Published with 2 topics
        const pubPostCreate = await postsPost(
          new NextRequest("http://localhost:3000/api/posts", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: userA.cookie,
            },
            body: JSON.stringify({ publicationId: pubA.id, slug: `pub-${tag}` }),
          }),
        );
        const pubPost = (await pubPostCreate.json()) as { id: string };
        await draftPut(
          new NextRequest(
            `http://localhost:3000/api/posts/${pubPost.id}/draft`,
            {
              method: "PUT",
              headers: {
                "content-type": "application/json",
                cookie: userA.cookie,
              },
              body: JSON.stringify({
                expectedVersion: 0,
                title: "User A Published Article",
                bodyMarkdown: "User A published body text",
              }),
            },
          ),
          { params: Promise.resolve({ id: pubPost.id }) },
        );
        await topicsPut(
          new NextRequest(
            `http://localhost:3000/api/posts/${pubPost.id}/topics`,
            {
              method: "PUT",
              headers: {
                "content-type": "application/json",
                cookie: userA.cookie,
              },
              body: JSON.stringify({ topicSlugs: ["tactics", "analytics"] }),
            },
          ),
          { params: Promise.resolve({ id: pubPost.id }) },
        );
        const pubTransition = await publishPost(
          new NextRequest(
            `http://localhost:3000/api/posts/${pubPost.id}/publish`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                cookie: userA.cookie,
                "x-request-id": `loader-pub-${tag}`,
              },
              body: JSON.stringify({ expectedVersion: 1 }),
            },
          ),
          { params: Promise.resolve({ id: pubPost.id }) },
        );
        expect(pubTransition.status).toBe(200);

        // Post 3: Soft-deleted
        const delCreate = await postsPost(
          new NextRequest("http://localhost:3000/api/posts", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: userA.cookie,
            },
            body: JSON.stringify({ publicationId: pubA.id, slug: `del-${tag}` }),
          }),
        );
        const delPost = (await delCreate.json()) as { id: string };
        const delRes = await deletePost(
          new NextRequest(
            `http://localhost:3000/api/posts/${delPost.id}/delete`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                cookie: userA.cookie,
                "x-request-id": `loader-del-${tag}`,
              },
              body: JSON.stringify({ expectedVersion: 0 }),
            },
          ),
          { params: Promise.resolve({ id: delPost.id }) },
        );
        expect(delRes.status).toBe(200);

        // Verify loadDashboardData isolation
        const dashA = await loadDashboardData({ userId: userA.userId });
        expect(dashA.kind).toBe("ready");
        if (dashA.kind === "ready") {
          expect(dashA.publication?.id).toBe(pubA.id);
          expect(dashA.posts.map((p) => p.status).sort()).toEqual([
            "deleted",
            "draft",
            "published",
          ]);
        }

        const dashB = await loadDashboardData({ userId: userB.userId });
        expect(dashB.kind).toBe("ready");
        if (dashB.kind === "ready") {
          expect(dashB.publication).toBeNull();
          expect(dashB.posts).toEqual([]);
        }
        expect(JSON.stringify(dashB)).not.toContain(pubA.id);
        expect(JSON.stringify(dashB)).not.toContain("User A Secret Draft Title");

        // Verify loadStudioPostData isolation (owner vs stranger)
        const studioOwner = await loadStudioPostData(
          { userId: userA.userId },
          pubPost.id,
        );
        expect(studioOwner.kind).toBe("ready");
        if (studioOwner.kind === "ready") {
          expect(studioOwner.title).toBe("User A Published Article");
          expect(studioOwner.bodyMarkdown).toBe("User A published body text");
          expect(studioOwner.status).toBe("published");
          expect(studioOwner.assignedTopics.map((t) => t.slug)).toEqual([
            "analytics",
            "tactics",
          ]);
        }

        const studioStrangerPublished = await loadStudioPostData(
          { userId: userB.userId },
          pubPost.id,
        );
        expect(studioStrangerPublished).toEqual({ kind: "not_found" });

        const studioStrangerDraft = await loadStudioPostData(
          { userId: userB.userId },
          draftPost.id,
        );
        expect(studioStrangerDraft).toEqual({ kind: "not_found" });
      },
    );
  },
);
