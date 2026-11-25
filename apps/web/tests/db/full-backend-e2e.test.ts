import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "../../src/kernel/db";
import { getCapturingTransport } from "../../src/modules/identity";
import { SEED_TOPICS, seedTopics } from "../../src/modules/topics";
import { GET as authGet, POST as authPost } from "../../src/app/api/auth/[...all]/route";
import { GET as healthGet } from "../../src/app/api/health/route";
import { GET as listTopicsGet } from "../../src/app/api/topics/route";
import { GET as searchGet } from "../../src/app/api/search/route";
import {
  GET as listPublicationsGet,
  POST as createPublicationPost,
} from "../../src/app/api/publications/route";
import { GET as getPublicationGet } from "../../src/app/api/publications/[id]/route";
import { POST as createPostPost } from "../../src/app/api/posts/route";
import { GET as getPostGet } from "../../src/app/api/posts/[id]/route";
import { GET as getDraftGet, PUT as saveDraftPut } from "../../src/app/api/posts/[id]/draft/route";
import { PUT as setTopicsPut } from "../../src/app/api/posts/[id]/topics/route";
import { POST as publishPost } from "../../src/app/api/posts/[id]/publish/route";
import { POST as unpublishPost } from "../../src/app/api/posts/[id]/unpublish/route";
import { POST as deletePost } from "../../src/app/api/posts/[id]/delete/route";
import { POST as restorePost } from "../../src/app/api/posts/[id]/restore/route";
import { POST as renameSlugPost } from "../../src/app/api/posts/[id]/slug/route";
import { GET as exportGet } from "../../src/app/api/account/export/route";
import { POST as erasureRequestPost } from "../../src/app/api/account/erasure/request/route";
import { POST as erasureConfirmPost } from "../../src/app/api/account/erasure/confirm/route";
import { DATABASE_URL, REQUIRED } from "./wp3a/harness";

/**
 * Full cross-module backend E2E on real Postgres 17.
 *
 * Every request goes through the shipped App Router handler. No DB, service, or
 * session lookup is mocked. The only test double is the in-memory
 * `CapturingTransport` that identity already uses in development, so email
 * verification and erasure tokens can be read deterministically.
 *
 * Isolation: the suite creates its own schema (`wp3a_test_full_backend_e2e`),
 * applies the committed migration to it, and points the process-wide
 * `DATABASE_URL` at that schema for the whole file. Better Auth, the route
 * handlers, the services, and the public reads (`/api/topics`, `/api/search`)
 * therefore all read and write the same isolated Postgres. `fileParallelism` is
 * off, so a single DB test file runs at a time and this cannot race a sibling.
 *
 * Spec note: the brief says `PATCH /api/posts/[id]/draft`. The route on
 * `origin/main` is `PUT` (there is no PATCH export), so Journey 2 uses the real
 * PUT handler rather than inventing a route that does not exist.
 */

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

function extractCookieHeader(response: Response): string {
  const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie;
  if (typeof getSetCookie === "function") {
    const cookies = getSetCookie.call(response.headers);
    if (cookies.length > 0) {
      return cookies.map((cookie) => cookie.split(";")[0] ?? "").join("; ");
    }
  }
  const single = response.headers.get("set-cookie");
  return single === null ? "" : (single.split(";")[0] ?? "");
}

type Session = { readonly userId: string; readonly email: string; readonly cookie: string };

describe("full backend e2e suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "DATABASE_URL must be provided when REQUIRE_DB=1 or CI=true").toBeTruthy();
    expect(DATABASE_URL).toMatch(/^postgres(ql)?:\/\//);
  });
});

describe.skipIf(!DATABASE_URL)("Full cross-module backend lifecycle and BOLA matrix", () => {
  const schema = "wp3a_test_full_backend_e2e";
  let pool: Pool;
  let admin: Pool;
  let previousDatabaseUrl: string | undefined;
  let suffix: string;
  let requestSeq = 0;

  beforeAll(async () => {
    previousDatabaseUrl = process.env.DATABASE_URL;
    suffix = `${Date.now()}`;

    admin = new Pool({ connectionString: DATABASE_URL, max: 1 });
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.query(`CREATE SCHEMA "${schema}"`);

    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 12,
      options: `-c search_path=${schema}`,
    });

    for (const statement of migrationStatements()) {
      await pool.query(statement.replace(/"public"\./g, `"${schema}".`));
    }

    const escaped = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace tn ON tn.oid = t.relnamespace
         JOIN pg_class r ON r.oid = c.confrelid
         JOIN pg_namespace rn ON rn.oid = r.relnamespace
        WHERE c.contype = 'f' AND tn.nspname = $1 AND rn.nspname <> $1`,
      [schema],
    );
    if (Number(escaped.rows[0]?.n ?? "0") !== 0) {
      throw new Error(`Migration foreign keys escaped the ${schema} schema`);
    }

    // From here on the whole app (Better Auth, routes, public reads) uses the
    // isolated schema. `closeDb` forgets any pool opened before this point.
    process.env.DATABASE_URL = `${DATABASE_URL}?options=-c%20search_path%3D${schema}`;
    await closeDb();

    await seedTopics({ kind: "db", db: drizzle(pool) });
  }, 120_000);

  afterAll(async () => {
    await closeDb();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    await pool.end();
    await admin.end();
  });

  function nextRequestId(prefix: string): string {
    requestSeq += 1;
    return `e2e-${prefix}-${requestSeq}`;
  }

  function req(path: string, init: RequestInit = {}): Request {
    return new Request(`http://localhost:3000${path}`, init);
  }

  function jsonRequest(
    method: string,
    path: string,
    body: unknown,
    cookie?: string,
    requestIdPrefix = "req",
  ): Request {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-request-id": nextRequestId(requestIdPrefix),
      "x-vercel-forwarded-for": "203.0.113.10",
    };
    if (cookie !== undefined && cookie !== "") headers.cookie = cookie;
    return req(path, { method, headers, body: JSON.stringify(body) });
  }

  function getRequest(path: string, cookie?: string): Request {
    const headers: Record<string, string> = {
      "x-request-id": nextRequestId("get"),
      "x-vercel-forwarded-for": "203.0.113.10",
    };
    if (cookie !== undefined && cookie !== "") headers.cookie = cookie;
    return req(path, { method: "GET", headers });
  }

  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  async function signUpAndVerify(
    label: string,
    email: string,
    password: string,
    name: string,
    ip: string,
  ): Promise<Session> {
    const transport = getCapturingTransport();
    transport.clear();

    const signUpRes = await authPost(
      new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-vercel-forwarded-for": ip },
        body: JSON.stringify({ email, password, name }),
      }),
    );
    expect(signUpRes.status, `${label} sign-up`).toBe(200);
    const signUpBody = (await signUpRes.json()) as { user: { id: string } };

    const mail = transport.getLastSentEmail();
    expect(mail?.to, `${label} verification email`).toBe(email);
    const verifyRes = await authGet(
      new NextRequest(mail!.url, { method: "GET", headers: { "x-vercel-forwarded-for": ip } }),
    );
    expect([200, 302], `${label} verify email`).toContain(verifyRes.status);

    const signInRes = await authPost(
      new NextRequest("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-vercel-forwarded-for": ip },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(signInRes.status, `${label} sign-in`).toBe(200);
    const cookie = extractCookieHeader(signInRes);
    expect(cookie, `${label} session cookie`).not.toBe("");

    return { userId: signUpBody.user.id, email, cookie };
  }

  async function column(table: string, columnName: string, id: string): Promise<unknown> {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT ${columnName} FROM "${table}" WHERE id = $1`,
      [id],
    );
    return result.rows[0]?.[columnName];
  }

  async function countRows(sqlText: string, params: unknown[]): Promise<number> {
    const result = await pool.query<{ c: number }>(sqlText, params);
    return Number(result.rows[0]?.c ?? 0);
  }

  it("runs the complete multi-user lifecycle, blocks every BOLA attempt, and erases User A with zero residue", async () => {
    // ---- Journey 1: auth & onboarding --------------------------------------
    const userA = await signUpAndVerify(
      "User A",
      `e2e-a-${suffix}@example.com`,
      "Password-A-2026!",
      "Author A",
      "198.51.100.21",
    );
    const userB = await signUpAndVerify(
      "User B",
      `e2e-b-${suffix}@example.com`,
      "Password-B-2026!",
      "Author B",
      "198.51.100.22",
    );

    const healthRes = await healthGet();
    expect(healthRes.status).toBe(200);
    expect(((await healthRes.json()) as { status: string }).status).toBe("ok");

    // ---- Journey 2: publication & post lifecycle ---------------------------
    const pubRes = await createPublicationPost(
      jsonRequest("POST", "/api/publications", { name: `E2E Pub ${suffix}` }, userA.cookie, "pub"),
    );
    expect(pubRes.status, "create publication").toBe(201);
    const publication = (await pubRes.json()) as { id: string; slug: string };
    expect(publication.id).toBeTruthy();

    const listPubRes = await listPublicationsGet(getRequest("/api/publications", userA.cookie));
    expect(listPubRes.status).toBe(200);
    const listedPubs = (await listPubRes.json()) as { publications: Array<{ id: string }> };
    expect(listedPubs.publications.map((p) => p.id)).toContain(publication.id);

    const ownedPubRes = await getPublicationGet(
      getRequest(`/api/publications/${publication.id}`, userA.cookie),
      ctx(publication.id),
    );
    expect(ownedPubRes.status).toBe(200);

    const postRes = await createPostPost(
      jsonRequest(
        "POST",
        "/api/posts",
        { publicationId: publication.id, slug: `e2e-post-${suffix}` },
        userA.cookie,
        "post",
      ),
    );
    expect(postRes.status, "create post").toBe(201);
    const post = (await postRes.json()) as { id: string; slug: string };

    // Draft edit is PUT on this branch (no PATCH route exists).
    const uniqueTerm = `ZzyzxUnique${suffix}`;
    const draftRes = await saveDraftPut(
      jsonRequest(
        "PUT",
        `/api/posts/${post.id}/draft`,
        {
          expectedVersion: 0,
          title: `${uniqueTerm} Title`,
          bodyMarkdown: `A unique discovery token ${uniqueTerm} inside the published body.`,
        },
        userA.cookie,
        "draft",
      ),
      ctx(post.id),
    );
    expect(draftRes.status, "save draft").toBe(200);
    const savedDraft = (await draftRes.json()) as { version: number };
    expect(savedDraft.version).toBe(1);

    const loadedDraftRes = await getDraftGet(
      getRequest(`/api/posts/${post.id}/draft`, userA.cookie),
      ctx(post.id),
    );
    expect(loadedDraftRes.status).toBe(200);
    expect((await loadedDraftRes.json()) as { title: string }).toMatchObject({
      title: `${uniqueTerm} Title`,
    });

    const topicsRes = await setTopicsPut(
      jsonRequest(
        "PUT",
        `/api/posts/${post.id}/topics`,
        { topicSlugs: ["tactics", "analytics"] },
        userA.cookie,
        "topics",
      ),
      ctx(post.id),
    );
    expect(topicsRes.status, "assign topics").toBe(200);
    const assigned = (await topicsRes.json()) as {
      status: string;
      topics: Array<{ slug: string }>;
    };
    expect(assigned.status).toBe("draft");
    expect(assigned.topics.map((t) => t.slug).sort()).toEqual(["analytics", "tactics"]);

    const publishRes = await publishPost(
      jsonRequest(
        "POST",
        `/api/posts/${post.id}/publish`,
        { expectedVersion: savedDraft.version },
        userA.cookie,
        "publish",
      ),
      ctx(post.id),
    );
    expect(publishRes.status, "publish").toBe(200);
    const published = (await publishRes.json()) as { status: string; version: number };
    expect(published.status).toBe("published");

    // ---- Journey 3: public discovery ---------------------------------------
    const topicsListRes = await listTopicsGet();
    expect(topicsListRes.status).toBe(200);
    const topicsBody = (await topicsListRes.json()) as {
      topics: Array<{ slug: string; publishedCount: number }>;
    };
    expect(topicsBody.topics.length).toBeGreaterThanOrEqual(SEED_TOPICS.length);
    expect(topicsBody.topics.find((t) => t.slug === "tactics")?.publishedCount).toBe(1);

    const searchRes = await searchGet(req(`/api/search?q=${uniqueTerm}`));
    expect(searchRes.status).toBe(200);
    const searchBody = (await searchRes.json()) as {
      items: Array<{ id: string; slug: string }>;
    };
    expect(searchBody.items.map((i) => i.id)).toContain(post.id);

    const publicPostRes = await getPostGet(getRequest(`/api/posts/${post.id}`), ctx(post.id));
    expect(publicPostRes.status, "anonymous published read").toBe(200);

    // A draft must not be discoverable: create a second, unpublished post.
    const draftOnlyRes = await createPostPost(
      jsonRequest(
        "POST",
        "/api/posts",
        { publicationId: publication.id, slug: `e2e-draft-${suffix}` },
        userA.cookie,
        "draftpost",
      ),
    );
    expect(draftOnlyRes.status).toBe(201);
    const draftOnly = (await draftOnlyRes.json()) as { id: string };
    await saveDraftPut(
      jsonRequest(
        "PUT",
        `/api/posts/${draftOnly.id}/draft`,
        {
          expectedVersion: 0,
          title: `${uniqueTerm} Draft`,
          bodyMarkdown: `secret ${uniqueTerm}`,
        },
        userA.cookie,
        "draftsave",
      ),
      ctx(draftOnly.id),
    );
    const draftSearchRes = await searchGet(req(`/api/search?q=${uniqueTerm}`));
    const draftSearchBody = (await draftSearchRes.json()) as { items: Array<{ id: string }> };
    expect(draftSearchBody.items.map((i) => i.id)).not.toContain(draftOnly.id);
    const anonDraftRes = await getPostGet(
      getRequest(`/api/posts/${draftOnly.id}`),
      ctx(draftOnly.id),
    );
    expect(anonDraftRes.status, "anonymous draft read is 404").toBe(404);

    // ---- Journey 4: cross-user BOLA (assume breach) ------------------------
    const bolaAttempts: Array<[string, Promise<Response>]> = [
      [
        "GET publication",
        getPublicationGet(
          getRequest(`/api/publications/${publication.id}`, userB.cookie),
          ctx(publication.id),
        ),
      ],
      [
        "POST post in A publication",
        createPostPost(
          jsonRequest(
            "POST",
            "/api/posts",
            { publicationId: publication.id },
            userB.cookie,
            "bola",
          ),
        ),
      ],
      ["GET post", getPostGet(getRequest(`/api/posts/${post.id}`, userB.cookie), ctx(post.id))],
      [
        "GET draft",
        getDraftGet(getRequest(`/api/posts/${post.id}/draft`, userB.cookie), ctx(post.id)),
      ],
      [
        "PUT draft",
        saveDraftPut(
          jsonRequest(
            "PUT",
            `/api/posts/${post.id}/draft`,
            { expectedVersion: published.version, title: "Hijack", bodyMarkdown: "Hijack" },
            userB.cookie,
            "bola",
          ),
          ctx(post.id),
        ),
      ],
      [
        "PUT topics",
        setTopicsPut(
          jsonRequest(
            "PUT",
            `/api/posts/${post.id}/topics`,
            { topicSlugs: ["transfers"] },
            userB.cookie,
            "bola",
          ),
          ctx(post.id),
        ),
      ],
      [
        "POST publish",
        publishPost(
          jsonRequest(
            "POST",
            `/api/posts/${post.id}/publish`,
            { expectedVersion: published.version },
            userB.cookie,
            "bola",
          ),
          ctx(post.id),
        ),
      ],
      [
        "POST unpublish",
        unpublishPost(
          jsonRequest(
            "POST",
            `/api/posts/${post.id}/unpublish`,
            { expectedVersion: published.version },
            userB.cookie,
            "bola",
          ),
          ctx(post.id),
        ),
      ],
      [
        "POST delete",
        deletePost(
          jsonRequest(
            "POST",
            `/api/posts/${post.id}/delete`,
            { expectedVersion: published.version },
            userB.cookie,
            "bola",
          ),
          ctx(post.id),
        ),
      ],
      [
        "POST restore",
        restorePost(
          jsonRequest(
            "POST",
            `/api/posts/${post.id}/restore`,
            { expectedVersion: published.version },
            userB.cookie,
            "bola",
          ),
          ctx(post.id),
        ),
      ],
      [
        "POST rename slug",
        renameSlugPost(
          jsonRequest(
            "POST",
            `/api/posts/${post.id}/slug`,
            { slug: `hijacked-${suffix}` },
            userB.cookie,
            "bola",
          ),
          ctx(post.id),
        ),
      ],
    ];

    for (const [label, pending] of bolaAttempts) {
      const response = await pending;
      if (label === "GET post") {
        // A published post is intentionally world-readable; the security
        // property here is that User B still cannot mutate it (proven below).
        expect(response.status, "published post is public").toBe(200);
        continue;
      }
      expect([403, 404], `BOLA ${label} must fail closed`).toContain(response.status);
    }

    // User A's data is unchanged after every attack.
    expect(await column("publications", "name", publication.id)).toBe(`E2E Pub ${suffix}`);
    expect(await column("posts", "status", post.id)).toBe("published");
    expect(await column("posts", "slug", post.id)).toBe(`e2e-post-${suffix}`);
    const topicsAfterAttack = await countRows(
      `SELECT count(*)::int AS c
         FROM post_topics pt
         JOIN topics t ON t.id = pt.topic_id
        WHERE pt.post_id = $1`,
      [post.id],
    );
    expect(topicsAfterAttack).toBe(2);

    // ---- Journey 5: rename -> unpublish -> delete -> restore -> export -> erase
    const renameRes = await renameSlugPost(
      jsonRequest(
        "POST",
        `/api/posts/${post.id}/slug`,
        { slug: `e2e-renamed-${suffix}` },
        userA.cookie,
        "rename",
      ),
      ctx(post.id),
    );
    expect(renameRes.status, "rename slug").toBe(200);
    expect(((await renameRes.json()) as { slug: string }).slug).toBe(`e2e-renamed-${suffix}`);

    const unpublishRes = await unpublishPost(
      jsonRequest(
        "POST",
        `/api/posts/${post.id}/unpublish`,
        { expectedVersion: published.version },
        userA.cookie,
        "unpublish",
      ),
      ctx(post.id),
    );
    expect(unpublishRes.status, "unpublish").toBe(200);
    const unpublished = (await unpublishRes.json()) as { status: string; version: number };
    expect(unpublished.status).toBe("draft");

    const deleteRes = await deletePost(
      jsonRequest(
        "POST",
        `/api/posts/${post.id}/delete`,
        { expectedVersion: unpublished.version },
        userA.cookie,
        "delete",
      ),
      ctx(post.id),
    );
    expect(deleteRes.status, "soft-delete").toBe(200);
    const deleted = (await deleteRes.json()) as { status: string; version: number };
    expect(deleted.status).toBe("deleted");
    expect(await column("posts", "status", post.id)).toBe("deleted");

    const restoreRes = await restorePost(
      jsonRequest(
        "POST",
        `/api/posts/${post.id}/restore`,
        { expectedVersion: deleted.version },
        userA.cookie,
        "restore",
      ),
      ctx(post.id),
    );
    expect(restoreRes.status, "restore").toBe(200);
    expect(((await restoreRes.json()) as { status: string }).status).toBe("draft");

    const exportRes = await exportGet(getRequest("/api/account/export", userA.cookie));
    expect(exportRes.status, "export").toBe(200);
    const exportText = await exportRes.text();
    const exported = JSON.parse(exportText) as {
      user: { id: string };
      publications: Array<{ id: string }>;
      posts: Array<{ id: string }>;
    };
    expect(exported.user.id).toBe(userA.userId);
    expect(exported.publications.map((p) => p.id)).toContain(publication.id);
    expect(exported.posts.map((p) => p.id)).toContain(post.id);
    expect(exported.posts.map((p) => p.id)).toContain(draftOnly.id);

    const erasureReqRes = await erasureRequestPost(
      jsonRequest(
        "POST",
        "/api/account/erasure/request",
        { password: "Password-A-2026!" },
        userA.cookie,
        "erase",
      ),
    );
    expect(erasureReqRes.status, "erasure request").toBe(202);
    const erasureMail = getCapturingTransport().getLastSentEmail();
    expect(erasureMail?.type).toBe("erasure_confirmation");
    const rawToken = erasureMail!.token;
    const expectedHash = createHash("sha256").update(rawToken).digest("hex");
    const storedToken = await pool.query<{ value: string }>(
      "SELECT value FROM verifications WHERE identifier = $1",
      [`account-erasure:${userA.userId}`],
    );
    expect(storedToken.rows[0]?.value).toBe(expectedHash);

    const confirmRes = await erasureConfirmPost(
      jsonRequest(
        "POST",
        "/api/account/erasure/confirm",
        { token: rawToken },
        userA.cookie,
        "erase",
      ),
    );
    expect(confirmRes.status, "erasure confirm").toBe(200);
    const confirmBody = (await confirmRes.json()) as { erased: boolean };
    expect(confirmBody.erased).toBe(true);

    // Zero residue for User A across every owned table.
    const residue: Array<[string, unknown[]]> = [
      ["SELECT count(*)::int AS c FROM users WHERE id = $1", [userA.userId]],
      ["SELECT count(*)::int AS c FROM sessions WHERE user_id = $1", [userA.userId]],
      ["SELECT count(*)::int AS c FROM accounts WHERE user_id = $1", [userA.userId]],
      ["SELECT count(*)::int AS c FROM publications WHERE owner_id = $1", [userA.userId]],
      [
        "SELECT count(*)::int AS c FROM posts po JOIN publications p ON p.id = po.publication_id WHERE p.owner_id = $1",
        [userA.userId],
      ],
      [
        "SELECT count(*)::int AS c FROM draft_state ds JOIN posts po ON po.id = ds.post_id JOIN publications p ON p.id = po.publication_id WHERE p.owner_id = $1",
        [userA.userId],
      ],
      [
        "SELECT count(*)::int AS c FROM post_revisions pr JOIN posts po ON po.id = pr.post_id JOIN publications p ON p.id = po.publication_id WHERE p.owner_id = $1",
        [userA.userId],
      ],
      [
        "SELECT count(*)::int AS c FROM post_topics pt JOIN posts po ON po.id = pt.post_id JOIN publications p ON p.id = po.publication_id WHERE p.owner_id = $1",
        [userA.userId],
      ],
      [
        "SELECT count(*)::int AS c FROM post_slug_history h JOIN posts po ON po.id = h.post_id JOIN publications p ON p.id = po.publication_id WHERE p.owner_id = $1",
        [userA.userId],
      ],
      [
        "SELECT count(*)::int AS c FROM publication_slug_history h JOIN publications p ON p.id = h.publication_id WHERE p.owner_id = $1",
        [userA.userId],
      ],
      [
        "SELECT count(*)::int AS c FROM verifications WHERE identifier = $1",
        [`account-erasure:${userA.userId}`],
      ],
    ];
    for (const [sqlText, params] of residue) {
      expect(await countRows(sqlText, params), `zero residue: ${sqlText}`).toBe(0);
    }

    // User B is untouched.
    const survivor = await pool.query<{ id: string }>("SELECT id FROM users WHERE id = $1", [
      userB.userId,
    ]);
    expect(survivor.rows).toHaveLength(1);
  }, 120_000);
});