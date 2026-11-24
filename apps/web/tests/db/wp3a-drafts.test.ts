import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePublication } from "../../src/modules/publications";
import { autosaveDraft, saveDraft, type DraftWriteResult } from "../../src/modules/posts";
import {
  DATABASE_URL,
  REQUIRED,
  barrier,
  count,
  createTestDatabase,
  type TestDatabase,
} from "./wp3a/harness";

describe("wp3a database suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "CI must provide DATABASE_URL for the WP3a suites").toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)("WP3a draft writes on a real Postgres", () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let seq = 0;

  beforeAll(async () => {
    testDb = await createTestDatabase("drafts");
    pool = testDb.pool;
  }, 120_000);

  afterAll(async () => {
    await testDb.close();
  });

  async function createOwner(): Promise<string> {
    seq += 1;
    const result = await pool.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [`wp3a-draft-${seq}@example.com`],
    );
    return result.rows[0]!.id;
  }

  async function createPost(ownerId: string): Promise<string> {
    const publication = await ensurePublication(
      { kind: "db", db: testDb.db },
      { actor: { userId: ownerId }, name: `Draft Post ${seq}` },
    );
    seq += 1;
    const result = await pool.query<{ id: string }>(
      "INSERT INTO posts (publication_id, slug) VALUES ($1, $2) RETURNING id",
      [publication.id, `draft-post-${seq}`],
    );
    return result.rows[0]!.id;
  }

  function actor(userId: string) {
    return { userId };
  }

  function executor() {
    return { kind: "db" as const, db: testDb.db };
  }

  /** Resolves with the rejection value, and fails the test if the call succeeds. */
  async function failureOf<T>(call: Promise<T>): Promise<{
    code?: string;
    details?: Record<string, unknown>;
  }> {
    let caught: unknown;
    let threw = false;
    try {
      await call;
    } catch (error) {
      caught = error;
      threw = true;
    }
    expect(threw, "the call must fail").toBe(true);
    return caught as { code?: string; details?: Record<string, unknown> };
  }

  it("starts a fresh post at version 1 without touching revisions", async () => {
    const owner = await createOwner();
    const post = await createPost(owner);

    const result = await autosaveDraft(executor(), {
      actor: actor(owner),
      postId: post,
      expectedVersion: 0,
      title: "First",
      bodyMarkdown: "hello",
    });

    expect(result.version).toBe(1);
    expect(result.revisionId).toBeNull();
    expect(await count(pool, "draft_state", "WHERE post_id = $1", [post])).toBe(1);
    expect(await count(pool, "post_revisions", "WHERE post_id = $1", [post])).toBe(0);
  });

  it("keeps revisions append-only: autosave never writes one", async () => {
    const owner = await createOwner();
    const post = await createPost(owner);

    let version = 0;
    for (let i = 0; i < 5; i += 1) {
      const result = await autosaveDraft(executor(), {
        actor: actor(owner),
        postId: post,
        expectedVersion: version,
        title: `Draft ${i}`,
        bodyMarkdown: `body ${i}`,
      });
      version = result.version;
    }

    expect(version).toBe(5);
    expect(await count(pool, "post_revisions", "WHERE post_id = $1", [post])).toBe(0);
  });

  it("appends exactly one revision on an explicit save and points base_revision_id at it", async () => {
    const owner = await createOwner();
    const post = await createPost(owner);

    const result = await saveDraft(executor(), {
      actor: actor(owner),
      postId: post,
      expectedVersion: 0,
      title: "Saved",
      bodyMarkdown: "saved body",
    });

    expect(result.version).toBe(1);
    expect(result.revisionId).not.toBeNull();
    expect(await count(pool, "post_revisions", "WHERE post_id = $1", [post])).toBe(1);

    const base = await pool.query<{ base_revision_id: string }>(
      "SELECT base_revision_id FROM draft_state WHERE post_id = $1",
      [post],
    );
    expect(base.rows[0]!.base_revision_id).toBe(result.revisionId);
  });

  it("turns 200 parallel autosaves at version 0 into one row, version 1, zero revisions", async () => {
    const owner = await createOwner();
    const post = await createPost(owner);
    const start = barrier(200);

    const settled = await Promise.allSettled(
      Array.from({ length: 200 }, async () => {
        await start();
        return autosaveDraft(executor(), {
          actor: actor(owner),
          postId: post,
          expectedVersion: 0,
          title: "Race",
          bodyMarkdown: "race body",
        });
      }),
    );

    const fulfilled = settled.filter((r) => r.status === "fulfilled");
    const rejected = settled.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(199);
    for (const failure of rejected) {
      const reason = (failure as PromiseRejectedResult).reason as { code?: string };
      expect(reason.code).toBe("CONFLICT");
    }

    expect(await count(pool, "draft_state", "WHERE post_id = $1", [post])).toBe(1);
    expect(await count(pool, "post_revisions", "WHERE post_id = $1", [post])).toBe(0);
    const version = await pool.query<{ version: number }>(
      "SELECT version FROM draft_state WHERE post_id = $1",
      [post],
    );
    expect(version.rows[0]!.version).toBe(1);
  });

  it("lets exactly one of two saves from the same version win, with no lost text", async () => {
    const owner = await createOwner();
    const post = await createPost(owner);
    await saveDraft(executor(), {
      actor: actor(owner),
      postId: post,
      expectedVersion: 0,
      title: "Base",
      bodyMarkdown: "base body",
    });

    const start = barrier(2);
    const settled = await Promise.allSettled(
      ["writer one", "writer two"].map(async (writer) => {
        await start();
        const result = await saveDraft(executor(), {
          actor: actor(owner),
          postId: post,
          expectedVersion: 1,
          title: writer,
          bodyMarkdown: `${writer} body`,
        });
        return { writer, result };
      }),
    );

    const fulfilled = settled.filter(
      (r): r is PromiseFulfilledResult<{ writer: string; result: DraftWriteResult }> =>
        r.status === "fulfilled",
    );
    const rejected = settled.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0]!.reason as { code?: string }).code).toBe("CONFLICT");

    const state = await pool.query<{ version: number; title: string; body_markdown: string }>(
      "SELECT version, title, body_markdown FROM draft_state WHERE post_id = $1",
      [post],
    );
    expect(state.rows[0]!.version).toBe(2);
    // The stored text is the winner's text, not a blend of both.
    expect(state.rows[0]!.title).toBe(fulfilled[0]!.value.writer);
    expect(state.rows[0]!.body_markdown).toBe(`${fulfilled[0]!.value.writer} body`);
    expect(await count(pool, "post_revisions", "WHERE post_id = $1", [post])).toBe(2);
  });

  it("rejects a stale token with the current draft and writes nothing", async () => {
    const owner = await createOwner();
    const post = await createPost(owner);
    await saveDraft(executor(), {
      actor: actor(owner),
      postId: post,
      expectedVersion: 0,
      title: "Current",
      bodyMarkdown: "current body",
    });

    const failure = await failureOf(
      saveDraft(executor(), {
        actor: actor(owner),
        postId: post,
        expectedVersion: 0,
        title: "Stale",
        bodyMarkdown: "stale body",
      }),
    );

    expect(failure.code).toBe("CONFLICT");
    expect(failure.details).toMatchObject({
      currentVersion: 1,
      currentTitle: "Current",
      currentBodyMarkdown: "current body",
    });

    const state = await pool.query<{ version: number; title: string; body_markdown: string }>(
      "SELECT version, title, body_markdown FROM draft_state WHERE post_id = $1",
      [post],
    );
    expect(state.rows[0]).toMatchObject({ version: 1, title: "Current", body_markdown: "current body" });
    expect(await count(pool, "post_revisions", "WHERE post_id = $1", [post])).toBe(1);
  });

  it("accepts exactly 102,400 bytes and rejects one byte more", async () => {
    const owner = await createOwner();
    const post = await createPost(owner);

    const accepted = await autosaveDraft(executor(), {
      actor: actor(owner),
      postId: post,
      expectedVersion: 0,
      title: "Big",
      bodyMarkdown: "a".repeat(102_400),
    });
    expect(accepted.version).toBe(1);

    await expect(
      autosaveDraft(executor(), {
        actor: actor(owner),
        postId: post,
        expectedVersion: 1,
        title: "Bigger",
        bodyMarkdown: "a".repeat(102_401),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const state = await pool.query<{ version: number }>(
      "SELECT version FROM draft_state WHERE post_id = $1",
      [post],
    );
    expect(state.rows[0]!.version).toBe(1);
  });

  it("rejects a title over 200 characters or containing a line break", async () => {
    const owner = await createOwner();
    const post = await createPost(owner);

    await expect(
      autosaveDraft(executor(), {
        actor: actor(owner),
        postId: post,
        expectedVersion: 0,
        title: "a".repeat(201),
        bodyMarkdown: "body",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(
      autosaveDraft(executor(), {
        actor: actor(owner),
        postId: post,
        expectedVersion: 0,
        title: "two\nlines",
        bodyMarkdown: "body",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(await count(pool, "draft_state", "WHERE post_id = $1", [post])).toBe(0);
  });

  it("refuses a stranger without touching the draft", async () => {
    const owner = await createOwner();
    const stranger = await createOwner();
    const post = await createPost(owner);

    await expect(
      saveDraft(executor(), {
        actor: actor(stranger),
        postId: post,
        expectedVersion: 0,
        title: "Hijack",
        bodyMarkdown: "hijack body",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      saveDraft(executor(), {
        actor: null,
        postId: post,
        expectedVersion: 0,
        title: "Anon",
        bodyMarkdown: "anon body",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await count(pool, "draft_state", "WHERE post_id = $1", [post])).toBe(0);
  });
});
