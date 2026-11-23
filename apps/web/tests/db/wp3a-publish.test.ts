import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePublication } from "../../src/modules/publications";
import {
  autosaveDraft,
  deletePost,
  publishPost,
  renamePost,
  resolvePostSlug,
  restorePost,
  unpublishPost,
} from "../../src/modules/posts";
import {
  DATABASE_URL,
  REQUIRED,
  barrier,
  count,
  createTestDatabase,
  sleep,
  type TestDatabase,
} from "./wp3a/harness";

/**
 * Step 6: publish lifecycle, atomicity, ownership and idempotency.
 *
 * Fault injection is data-driven: two triggers on `audit_events` raise for a
 * `request_id` prefix. That is deterministic (no clocks, no sleeps) and it
 * exercises the real transaction: the failure happens inside the same
 * transaction the service opened.
 */

describe("wp3a publish suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "CI must provide DATABASE_URL for the WP3a suites").toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)("WP3a publish lifecycle on a real Postgres", () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let seq = 0;

  beforeAll(async () => {
    testDb = await createTestDatabase("publish");
    pool = testDb.pool;

    await pool.query(`
      CREATE FUNCTION fail_before_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.request_id LIKE 'fail-audit-%' THEN
          RAISE EXCEPTION 'injected audit failure'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`
      CREATE TRIGGER audit_before_insert
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_before_audit()
    `);
    await pool.query(`
      CREATE FUNCTION fail_after_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.request_id LIKE 'fail-after-audit-%' THEN
          RAISE EXCEPTION 'injected failure after audit insert'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`
      CREATE TRIGGER audit_after_insert
      AFTER INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_after_audit()
    `);
  }, 120_000);

  afterAll(async () => {
    await testDb.close();
  });

  const db = () => ({ kind: "db" as const, db: testDb.db });
  const actor = (userId: string) => ({ userId });

  async function createOwner(label: string): Promise<string> {
    seq += 1;
    const result = await pool.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [`wp3a-pub-${label}-${seq}@example.com`],
    );
    return result.rows[0]!.id;
  }

  async function createPostWithDraft(
    ownerId: string,
    label: string,
    title = "Title",
    bodyMarkdown = "Body",
  ): Promise<{ publicationId: string; postId: string; version: number }> {
    const publication = await ensurePublication(db(), {
      actor: actor(ownerId),
      name: `Publish ${label} ${seq}`,
    });
    const inserted = await pool.query<{ id: string }>(
      "INSERT INTO posts (publication_id, slug, status) VALUES ($1, $2, 'draft') RETURNING id",
      [publication.id, `pub-${label}-${seq}`],
    );
    const postId = inserted.rows[0]!.id;
    const draft = await autosaveDraft(db(), {
      actor: actor(ownerId),
      postId,
      expectedVersion: 0,
      title,
      bodyMarkdown,
    });
    return { publicationId: publication.id, postId, version: draft.version };
  }

  async function postRow(postId: string): Promise<{
    status: string;
    slug: string;
    published_revision_id: string | null;
    published_at: Date | null;
    deleted_at: Date | null;
  }> {
    const result = await pool.query<{
      status: string;
      slug: string;
      published_revision_id: string | null;
      published_at: Date | null;
      deleted_at: Date | null;
    }>("SELECT status, slug, published_revision_id, published_at, deleted_at FROM posts WHERE id = $1", [
      postId,
    ]);
    return result.rows[0]!;
  }

  async function auditCount(postId: string): Promise<number> {
    return count(pool, "audit_events", "WHERE target_id = $1", [postId]);
  }

  async function revisionCount(postId: string): Promise<number> {
    return count(pool, "post_revisions", "WHERE post_id = $1", [postId]);
  }

  async function draftVersion(postId: string): Promise<number> {
    const result = await pool.query<{ version: number }>(
      "SELECT version FROM draft_state WHERE post_id = $1",
      [postId],
    );
    return result.rows[0]!.version;
  }

  async function failureOf(call: Promise<unknown>): Promise<{ code?: string; details?: Record<string, unknown> }> {
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

  it("publishes a draft: pointer, status, one revision, one audit row, version +1", async () => {
    const owner = await createOwner("happy");
    const { postId, version } = await createPostWithDraft(owner, "happy", "First", "Body one");

    const result = await publishPost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: version,
      requestId: `req-publish-${seq}`,
    });

    expect(result.status).toBe("published");
    expect(result.noOp).toBe(false);
    expect(result.revisionId).toBeTruthy();
    expect(result.version).toBe(version + 1);

    const row = await postRow(postId);
    expect(row.status).toBe("published");
    expect(row.published_revision_id).toBe(result.revisionId);
    expect(row.published_at).not.toBeNull();
    expect(await revisionCount(postId)).toBe(1);
    expect(await auditCount(postId)).toBe(1);
    expect(await draftVersion(postId)).toBe(version + 1);

    const audit = await pool.query<{ action: string; actor_user_id: string; request_id: string }>(
      "SELECT action, actor_user_id, request_id FROM audit_events WHERE target_id = $1",
      [postId],
    );
    expect(audit.rows[0]).toMatchObject({
      action: "post.published",
      actor_user_id: owner,
      request_id: `req-publish-${seq}`,
    });
  });

  it("publishes a newer revision and keeps published_at exactly where it was", async () => {
    const owner = await createOwner("newer");
    const { postId, version } = await createPostWithDraft(owner, "newer", "One", "Body one");

    const first = await publishPost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: version,
      requestId: `req-newer-1-${seq}`,
    });
    const firstRow = await postRow(postId);

    const saved = await autosaveDraft(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: first.version,
      title: "Two",
      bodyMarkdown: "Body two",
    });

    const second = await publishPost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: saved.version,
      requestId: `req-newer-2-${seq}`,
    });

    const secondRow = await postRow(postId);
    expect(second.revisionId).not.toBe(first.revisionId);
    expect(secondRow.published_revision_id).toBe(second.revisionId);
    expect(secondRow.published_at!.getTime()).toBe(firstRow.published_at!.getTime());
    expect(await revisionCount(postId)).toBe(2);
    expect(await auditCount(postId)).toBe(2);
  });

  it("republishing identical text is a no-op: no revision, no audit, same pointer", async () => {
    const owner = await createOwner("noop");
    const { postId, version } = await createPostWithDraft(owner, "noop");

    const first = await publishPost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: version,
      requestId: `req-noop-1-${seq}`,
    });
    const revisions = await revisionCount(postId);
    const audits = await auditCount(postId);

    // The client re-read the draft (version bumped by publish) and publishes again.
    const again = await publishPost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: first.version,
      requestId: `req-noop-2-${seq}`,
    });

    expect(again.noOp).toBe(true);
    expect(again.revisionId).toBe(first.revisionId);
    expect(await revisionCount(postId)).toBe(revisions);
    expect(await auditCount(postId)).toBe(audits);
    // @ts-expect-error TS18048: 'first.publishedAt' is possibly 'undefined'
    expect((await postRow(postId)).published_at!.getTime()).toBe(first.publishedAt.getTime());
  });

  it("a retried requestId is idempotent even with the now-stale version", async () => {
    const owner = await createOwner("retry");
    const { postId, version } = await createPostWithDraft(owner, "retry");
    const requestId = `req-retry-${seq}`;

    const first = await publishPost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: version,
      requestId,
    });
    const retry = await publishPost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: version, // deliberately stale
      requestId,
    });

    expect(retry.noOp).toBe(true);
    expect(retry.revisionId).toBe(first.revisionId);
    expect(await revisionCount(postId)).toBe(1);
    expect(await auditCount(postId)).toBe(1);
    expect(await draftVersion(postId)).toBe(version + 1);
  });

  it("two parallel publishes from one version: one winner, one CONFLICT, one revision, one audit", async () => {
    const owner = await createOwner("race2");
    const { postId, version } = await createPostWithDraft(owner, "race2");

    const start = barrier(2);
    const calls = [1, 2].map(async (n) => {
      await start();
      return publishPost(db(), {
        actor: actor(owner),
        postId,
        expectedVersion: version,
        requestId: `req-race2-${n}-${seq}`,
      });
    });

    const settled = await Promise.allSettled(calls);
    const winners = settled.filter((result) => result.status === "fulfilled");
    const losers = settled.filter((result) => result.status === "rejected");

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect((losers[0] as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT" });
    expect(await revisionCount(postId)).toBe(1);
    expect(await auditCount(postId)).toBe(1);
    expect(await draftVersion(postId)).toBe(version + 1);
  });

  it("50 parallel publishes from one version still produce exactly one revision and one audit row", async () => {
    const owner = await createOwner("race50");
    const { postId, version } = await createPostWithDraft(owner, "race50");

    const start = barrier(50);
    const calls = Array.from({ length: 50 }, async (_, n) => {
      await start();
      return publishPost(db(), {
        actor: actor(owner),
        postId,
        expectedVersion: version,
        requestId: `req-race50-${n}-${seq}`,
      });
    });

    const settled = await Promise.allSettled(calls);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      settled
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .every((result) => (result.reason as { code?: string }).code === "CONFLICT"),
    ).toBe(true);
    expect(await revisionCount(postId)).toBe(1);
    expect(await auditCount(postId)).toBe(1);
  }, 120_000);

  it("refuses a stranger before touching anything", async () => {
    const owner = await createOwner("stranger-owner");
    const stranger = await createOwner("stranger");
    const { postId, version } = await createPostWithDraft(owner, "stranger");

    const failure = await failureOf(
      publishPost(db(), {
        actor: actor(stranger),
        postId,
        expectedVersion: version,
        requestId: `req-stranger-${seq}`,
      }),
    );

    expect(failure.code).toBe("FORBIDDEN");
    expect((await postRow(postId)).status).toBe("draft");
    expect(await revisionCount(postId)).toBe(0);
    expect(await auditCount(postId)).toBe(0);
  });

  it("a stale version is CONFLICT carrying the current draft, and writes nothing", async () => {
    const owner = await createOwner("stale");
    const { postId, version } = await createPostWithDraft(owner, "stale", "Current", "Current body");

    const failure = await failureOf(
      publishPost(db(), {
        actor: actor(owner),
        postId,
        expectedVersion: version - 1,
        requestId: `req-stale-${seq}`,
      }),
    );

    expect(failure.code).toBe("CONFLICT");
    expect(failure.details).toMatchObject({
      currentVersion: version,
      currentTitle: "Current",
      currentBodyMarkdown: "Current body",
    });
    expect((await postRow(postId)).status).toBe("draft");
    expect(await revisionCount(postId)).toBe(0);
    expect(await auditCount(postId)).toBe(0);
  });

  it("enforces every legal transition and rejects only deleted -> published", async () => {
    const owner = await createOwner("lifecycle");
    const { publicationId, postId, version } = await createPostWithDraft(owner, "lifecycle");
    const first = await publishPost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: version,
      requestId: `req-life-1-${seq}`,
    });
    const publishedAt = (await postRow(postId)).published_at!.getTime();

    // published -> draft
    const unpublished = await unpublishPost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: first.version,
      requestId: `req-life-2-${seq}`,
    });
    expect(unpublished.status).toBe("draft");
    expect((await postRow(postId)).published_revision_id).toBeNull();
    const slugAfterUnpublish = (await postRow(postId)).slug;
    expect(await resolvePostSlug(db(), publicationId, slugAfterUnpublish)).toBeUndefined();

    // draft -> published again keeps the original published_at
    const republished = await publishPost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: unpublished.version,
      requestId: `req-life-3-${seq}`,
    });
    expect((await postRow(postId)).published_at!.getTime()).toBe(publishedAt);
    expect(republished.noOp).toBe(false);

    // published -> deleted
    const deleted = await deletePost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: republished.version,
      requestId: `req-life-4-${seq}`,
    });
    expect(deleted.status).toBe("deleted");
    expect((await postRow(postId)).deleted_at).not.toBeNull();
    expect((await postRow(postId)).published_revision_id).toBeNull();

    // deleted -> published is the only illegal transition
    const illegal = await failureOf(
      publishPost(db(), {
        actor: actor(owner),
        postId,
        expectedVersion: deleted.version,
        requestId: `req-life-5-${seq}`,
      }),
    );
    expect(illegal.code).toBe("CONFLICT");
    expect((await postRow(postId)).status).toBe("deleted");

    // deleted -> draft (restore), then publish
    const restored = await restorePost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: deleted.version,
      requestId: `req-life-6-${seq}`,
    });
    expect(restored.status).toBe("draft");
    expect((await postRow(postId)).deleted_at).toBeNull();

    const afterRestore = await publishPost(db(), {
      actor: actor(owner),
      postId,
      expectedVersion: restored.version,
      requestId: `req-life-7-${seq}`,
    });
    expect(afterRestore.status).toBe("published");
  });

  it("rejects a failure after the audit insert and rolls the whole publish back", async () => {
    const owner = await createOwner("fail-after");
    const { postId, version } = await createPostWithDraft(owner, "fail-after");

    await failureOf(
      publishPost(db(), {
        actor: actor(owner),
        postId,
        expectedVersion: version,
        requestId: `fail-after-audit-${seq}`,
      }),
    );

    const row = await postRow(postId);
    expect(row.status).toBe("draft");
    expect(row.published_revision_id).toBeNull();
    expect(row.published_at).toBeNull();
    expect(await revisionCount(postId)).toBe(0);
    expect(await auditCount(postId)).toBe(0);
    expect(await draftVersion(postId)).toBe(version);
  });

  it("rejects an audit insert failure and rolls the whole publish back", async () => {
    const owner = await createOwner("fail-before");
    const { postId, version } = await createPostWithDraft(owner, "fail-before");

    await failureOf(
      publishPost(db(), {
        actor: actor(owner),
        postId,
        expectedVersion: version,
        requestId: `fail-audit-${seq}`,
      }),
    );

    const row = await postRow(postId);
    expect(row.status).toBe("draft");
    expect(row.published_revision_id).toBeNull();
    expect(row.published_at).toBeNull();
    expect(await revisionCount(postId)).toBe(0);
    expect(await auditCount(postId)).toBe(0);
    expect(await draftVersion(postId)).toBe(version);
  });

  it("rejects an empty or oversized requestId", async () => {
    const owner = await createOwner("request-id");
    const { postId, version } = await createPostWithDraft(owner, "request-id");

    expect(
      (await failureOf(
        publishPost(db(), { actor: actor(owner), postId, expectedVersion: version, requestId: "" }),
      )).code,
    ).toBe("VALIDATION");
    expect(
      (await failureOf(
        publishPost(db(), {
          actor: actor(owner),
          postId,
          expectedVersion: version,
          requestId: "x".repeat(65),
        }),
      )).code,
    ).toBe("VALIDATION");
  });

  it("publishing a post with no draft row: VALIDATION for a draft, no-op when already published", async () => {
    const owner = await createOwner("rowless");
    const publication = await ensurePublication(db(), {
      actor: actor(owner),
      name: `Rowless ${seq}`,
    });
    const inserted = await pool.query<{ id: string }>(
      "INSERT INTO posts (publication_id, slug, status) VALUES ($1, $2, 'draft') RETURNING id",
      [publication.id, `rowless-${seq}`],
    );
    const postId = inserted.rows[0]!.id;

    expect(
      (await failureOf(
        publishPost(db(), {
          actor: actor(owner),
          postId,
          expectedVersion: 0,
          requestId: `req-rowless-1-${seq}`,
        }),
      )).code,
    ).toBe("VALIDATION");
    expect((await postRow(postId)).status).toBe("draft");
  });

  it("forced interleaving: publish waits for an open rename and sees the committed slug", async () => {
    const owner = await createOwner("rename-publish");
    const { publicationId, postId, version } = await createPostWithDraft(owner, "rename-publish");

    let releaseRename!: () => void;
    const holdRename = new Promise<void>((resolve) => {
      releaseRename = resolve;
    });
    let announceLock!: () => void;
    const lockHeld = new Promise<void>((resolve) => {
      announceLock = resolve;
    });

    const rename = testDb.db.transaction(async (tx) => {
      const result = await renamePost({ kind: "tx", tx }, {
        actor: actor(owner),
        postId,
        slug: `renamed-${seq}`,
      });
      announceLock();
      await holdRename;
      return result;
    });

    try {
      await lockHeld;
      let publishSettled = false;
      const publish = publishPost(db(), {
        actor: actor(owner),
        postId,
        expectedVersion: version,
        requestId: `req-rename-publish-${seq}`,
      }).finally(() => {
        publishSettled = true;
      });

      await waitForLockWaiter(pool, 5_000);
      expect(publishSettled).toBe(false);

      releaseRename();
      const [renameResult, publishResult] = await Promise.all([rename, publish]);

      expect(renameResult.changed).toBe(true);
      expect(publishResult.status).toBe("published");

      const row = await postRow(postId);
      expect(row.slug).toBe(`renamed-${seq}`);
      expect(row.status).toBe("published");
      expect(row.published_revision_id).toBe(publishResult.revisionId);
      expect(await count(pool, "post_slug_history", "WHERE post_id = $1", [postId])).toBe(1);
      expect(await auditCount(postId)).toBe(1);
      expect(await resolvePostSlug(db(), publicationId, `renamed-${seq}`)).toEqual({
        postId,
        slug: `renamed-${seq}`,
        redirect: false,
      });
    } finally {
      releaseRename();
      await rename.catch(() => undefined);
    }
  }, 60_000);
});

/** Polls `pg_stat_activity` until some backend is waiting on a lock. */
async function waitForLockWaiter(pool: Pool, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND state = 'active'",
    );
    if (Number(result.rows[0]!.n) > 0) return;
    if (Date.now() > deadline) throw new Error("no backend ever waited on a lock");
    await sleep(20);
  }
}
