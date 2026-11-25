import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jsonError } from "../../src/app/api/_lib/respond";
import { ensurePublication, type Actor } from "../../src/modules/publications";
import {
  createPost,
  deletePost,
  getDraftForOwner,
  publishPost,
  renamePost,
  restorePost,
  saveDraft,
  unpublishPost,
} from "../../src/modules/posts";
import {
  DATABASE_URL,
  REQUIRED,
  createTestDatabase,
  type TestDatabase,
} from "./wp3a/harness";

/**
 * WP3b Part 1: the service path the write routes call, on a real Postgres.
 *
 * The routes themselves are thin: they resolve the actor (401 tested in
 * `wp3b-unauth.test.ts`), parse the body, call one of these services, and map the
 * result or ServiceError through `jsonError` (mapped in `wp3b-http.test.ts`).
 * This suite proves the middle: a stranger is refused at 403 and a stale CAS
 * token is a 409 with the exact conflict shape, and the full happy path
 * create-publication -> create-post -> save-draft -> publish -> unpublish ->
 * delete -> restore leaves the rows in the state ADR-007 promises.
 */

describe("wp3b api suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "CI must provide DATABASE_URL for the WP3b suite").toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)("WP3b writer services on a real Postgres", () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let seq = 0;

  beforeAll(async () => {
    testDb = await createTestDatabase("wp3b");
    pool = testDb.pool;
  }, 120_000);

  afterAll(async () => {
    await testDb.close();
  });

  const db = () => ({ kind: "db" as const, db: testDb.db });
  const actor = (userId: string): Actor => ({ userId });

  async function createOwner(label: string): Promise<string> {
    seq += 1;
    const result = await pool.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [`wp3b-${label}-${seq}@example.com`],
    );
    return result.rows[0]!.id;
  }

  async function statusOf(postId: string): Promise<{ status: string; published_at: Date | null; deleted_at: Date | null }> {
    const result = await pool.query<{ status: string; published_at: Date | null; deleted_at: Date | null }>(
      "SELECT status, published_at, deleted_at FROM posts WHERE id = $1",
      [postId],
    );
    return result.rows[0]!;
  }

  /** Map a rejected ServiceError the way the route does, then assert status. */
  async function expectHttp(
    call: Promise<unknown>,
    status: number,
    code: string,
  ): Promise<{ response: Response; body: Record<string, unknown> }> {
    let caught: unknown;
    let threw = false;
    try {
      await call;
    } catch (error) {
      caught = error;
      threw = true;
    }
    expect(threw, "the service call must fail").toBe(true);
    const response = jsonError(caught, "req-db");
    expect(response.status).toBe(status);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.code).toBe(code);
    return { response, body };
  }

  it("happy path: create publication -> create post -> save draft -> publish -> rename slug -> unpublish -> delete -> restore", async () => {
    const owner = await createOwner("happy");
    const who = actor(owner);

    const publication = await ensurePublication(db(), { actor: who, name: `WP3b ${seq}` });
    expect(publication.created).toBe(true);

    const post = await createPost(db(), { actor: who, publicationId: publication.id });
    expect(post.slug).toBeTruthy();

    const draft = await saveDraft(db(), {
      actor: who,
      postId: post.id,
      expectedVersion: 0,
      title: "A title",
      bodyMarkdown: "A body",
    });
    expect(draft.version).toBe(1);

    const loaded = await getDraftForOwner(db(), post.id, who);
    expect(loaded).toMatchObject({ version: 1, title: "A title", bodyMarkdown: "A body" });

    const published = await publishPost(db(), {
      actor: who,
      postId: post.id,
      expectedVersion: draft.version,
      requestId: `req-wp3b-publish-${seq}`,
    });
    expect(published.status).toBe("published");
    expect((await statusOf(post.id)).published_at).not.toBeNull();

    // A published post can be renamed; the new address is the live one and a
    // history row records the old address for the redirect (WP3a slugs.ts).
    const renamed = await renamePost(db(), {
      actor: who,
      postId: post.id,
      slug: `renamed-${seq}`,
    });
    expect(renamed.changed).toBe(true);
    const slugRow = await pool.query<{ slug: string }>("SELECT slug FROM posts WHERE id = $1", [post.id]);
    expect(slugRow.rows[0]!.slug).toBe(`renamed-${seq}`);

    const unpublished = await unpublishPost(db(), {
      actor: who,
      postId: post.id,
      expectedVersion: published.version,
      requestId: `req-wp3b-unpublish-${seq}`,
    });
    expect(unpublished.status).toBe("draft");
    expect((await statusOf(post.id)).published_at).not.toBeNull(); // preserved

    const deleted = await deletePost(db(), {
      actor: who,
      postId: post.id,
      expectedVersion: unpublished.version,
      requestId: `req-wp3b-delete-${seq}`,
    });
    expect(deleted.status).toBe("deleted");
    expect((await statusOf(post.id)).deleted_at).not.toBeNull();

    const restored = await restorePost(db(), {
      actor: who,
      postId: post.id,
      expectedVersion: deleted.version,
      requestId: `req-wp3b-restore-${seq}`,
    });
    expect(restored.status).toBe("draft");
    expect((await statusOf(post.id)).deleted_at).toBeNull();
  });

  it("stranger acting on another owner's publication -> 403 FORBIDDEN", async () => {
    const owner = await createOwner("owner");
    const stranger = await createOwner("stranger");
    const publication = await ensurePublication(db(), {
      actor: actor(owner),
      name: `Stranger pub ${seq}`,
    });

    const response = await expectHttp(
      createPost(db(), { actor: actor(stranger), publicationId: publication.id }),
      403,
      "FORBIDDEN",
    );
    expect(response.response.headers.get("cache-control")).toBe("no-store");
  });

  it("stranger saving another owner's draft -> 403 FORBIDDEN", async () => {
    const owner = await createOwner("draft-owner");
    const stranger = await createOwner("draft-stranger");
    const publication = await ensurePublication(db(), {
      actor: actor(owner),
      name: `Draft pub ${seq}`,
    });
    const post = await createPost(db(), { actor: actor(owner), publicationId: publication.id });

    await expectHttp(
      saveDraft(db(), {
        actor: actor(stranger),
        postId: post.id,
        expectedVersion: 0,
        title: "Hijack",
        bodyMarkdown: "Hijack body",
      }),
      403,
      "FORBIDDEN",
    );
    const loaded = await getDraftForOwner(db(), post.id, actor(owner));
    expect(loaded.title).toBe(""); // nothing was written
  });

  it("stale expectedVersion -> 409 CONFLICT with the exact current draft", async () => {
    const owner = await createOwner("stale");
    const who = actor(owner);
    const publication = await ensurePublication(db(), { actor: who, name: `Stale pub ${seq}` });
    const post = await createPost(db(), { actor: who, publicationId: publication.id });

    const first = await saveDraft(db(), {
      actor: who,
      postId: post.id,
      expectedVersion: 0,
      title: "Live title",
      bodyMarkdown: "Live body",
    });

    const { body } = await expectHttp(
      saveDraft(db(), {
        actor: who,
        postId: post.id,
        expectedVersion: 0, // stale: the first save moved it to 1
        title: "Overwrite",
        bodyMarkdown: "Overwrite body",
      }),
      409,
      "CONFLICT",
    );
    expect(body.details).toMatchObject({
      currentVersion: first.version,
      currentTitle: "Live title",
      currentBodyMarkdown: "Live body",
    });
    expect((await getDraftForOwner(db(), post.id, who)).title).toBe("Live title");
  });

  it("stale version on publish -> 409 CONFLICT (not a silent overwrite)", async () => {
    const owner = await createOwner("pub-stale");
    const who = actor(owner);
    const publication = await ensurePublication(db(), { actor: who, name: `Pub stale ${seq}` });
    const post = await createPost(db(), { actor: who, publicationId: publication.id });
    const draft = await saveDraft(db(), {
      actor: who,
      postId: post.id,
      expectedVersion: 0,
      title: "T",
      bodyMarkdown: "B",
    });

    await expectHttp(
      publishPost(db(), {
        actor: who,
        postId: post.id,
        expectedVersion: draft.version - 1,
        requestId: `req-wp3b-stale-${seq}`,
      }),
      409,
      "CONFLICT",
    );
    expect((await statusOf(post.id)).status).toBe("draft");
  });
});