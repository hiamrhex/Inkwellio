import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renamePost, resolvePostSlug } from "../../src/modules/posts";
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
 * Step 4: rename, slug history, and public slug resolution.
 *
 * The ordering requirement — history before the pointer moves — is not asserted
 * by reading the source. A `BEFORE UPDATE OF slug` trigger is installed in this
 * suite's schema and refuses any slug change whose retired address is not
 * already in `post_slug_history`. An implementation that updates first and
 * records history afterwards cannot pass, and the mutation proof in the report
 * breaks exactly that order.
 */

describe("wp3a slugs suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "CI must provide DATABASE_URL for the WP3a suites").toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)("WP3a rename and slug history on a real Postgres", () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let seq = 0;

  beforeAll(async () => {
    testDb = await createTestDatabase("slugs");
    pool = testDb.pool;

    // The ordering proof. Scoped to slug changes so publish's status/pointer
    // update is unaffected. The function name is unqualified and resolves
    // through this suite's search_path.
    await pool.query(`
      CREATE FUNCTION require_retired_slug_history() RETURNS trigger AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM post_slug_history
           WHERE post_id = NEW.id AND slug = OLD.slug
        ) THEN
          RAISE EXCEPTION 'slug moved from % before its history row was written', OLD.slug
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`
      CREATE TRIGGER posts_slug_history_first
      BEFORE UPDATE OF slug ON posts
      FOR EACH ROW
      WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
      EXECUTE FUNCTION require_retired_slug_history()
    `);
  }, 120_000);

  afterAll(async () => {
    await testDb.close();
  });

  const db = () => ({ kind: "db" as const, db: testDb.db });

  async function createOwner(label: string): Promise<string> {
    seq += 1;
    const result = await pool.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [`wp3a-slug-${label}-${seq}@example.com`],
    );
    return result.rows[0]!.id;
  }

  async function createPublication(ownerId: string, slug: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      "INSERT INTO publications (owner_id, slug, name) VALUES ($1, $2, $3) RETURNING id",
      [ownerId, slug, `Publication ${slug}`],
    );
    return result.rows[0]!.id;
  }

  async function createPost(publicationId: string, slug: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      "INSERT INTO posts (publication_id, slug, status) VALUES ($1, $2, 'draft') RETURNING id",
      [publicationId, slug],
    );
    return result.rows[0]!.id;
  }

  /** Fixture only: makes a post publicly visible so resolution can be tested
   * before the publish service lands in Step 6. */
  async function makePublished(postId: string): Promise<void> {
    const revision = await pool.query<{ id: string }>(
      "INSERT INTO post_revisions (post_id, title, body_markdown) VALUES ($1, 'Title', 'Body') RETURNING id",
      [postId],
    );
    await pool.query(
      "UPDATE posts SET status = 'published', published_revision_id = $1, published_at = now() WHERE id = $2",
      [revision.rows[0]!.id, postId],
    );
  }

  async function failureOf(call: Promise<unknown>): Promise<{ code?: string }> {
    let caught: unknown;
    let threw = false;
    try {
      await call;
    } catch (error) {
      caught = error;
      threw = true;
    }
    expect(threw, "the call must fail").toBe(true);
    return caught as { code?: string };
  }

  async function slugOf(postId: string): Promise<string> {
    const result = await pool.query<{ slug: string }>("SELECT slug FROM posts WHERE id = $1", [postId]);
    return result.rows[0]!.slug;
  }

  it("writes the retired slug to history before moving the pointer", async () => {
    const owner = await createOwner("order");
    const publicationId = await createPublication(owner, `order-${seq}`);
    const postId = await createPost(publicationId, `order-old-${seq}`);

    const result = await renamePost(db(), {
      actor: { userId: owner },
      postId,
      slug: `order-new-${seq}`,
    });

    expect(result).toEqual({ id: postId, slug: `order-new-${seq}`, changed: true });
    expect(await slugOf(postId)).toBe(`order-new-${seq}`);
    const history = await pool.query<{ slug: string }>(
      "SELECT slug FROM post_slug_history WHERE post_id = $1",
      [postId],
    );
    expect(history.rows.map((row) => row.slug)).toEqual([`order-old-${seq}`]);
  });

  it("resolves the current slug without a redirect", async () => {
    const owner = await createOwner("live");
    const publicationId = await createPublication(owner, `live-${seq}`);
    const postId = await createPost(publicationId, `live-slug-${seq}`);
    await makePublished(postId);

    const resolved = await resolvePostSlug(db(), publicationId, `live-slug-${seq}`);
    expect(resolved).toEqual({ postId, slug: `live-slug-${seq}`, redirect: false });
  });

  it("redirects an old slug to the post that now lives elsewhere", async () => {
    const owner = await createOwner("redirect");
    const publicationId = await createPublication(owner, `redirect-${seq}`);
    const postId = await createPost(publicationId, `redirect-old-${seq}`);
    await makePublished(postId);
    await renamePost(db(), {
      actor: { userId: owner },
      postId,
      slug: `redirect-new-${seq}`,
    });

    expect(await resolvePostSlug(db(), publicationId, `redirect-old-${seq}`)).toEqual({
      postId,
      slug: `redirect-new-${seq}`,
      redirect: true,
    });
    expect(await resolvePostSlug(db(), publicationId, `redirect-new-${seq}`)).toEqual({
      postId,
      slug: `redirect-new-${seq}`,
      redirect: false,
    });
  });

  it("does not resolve a draft, a deleted post, or another publication's slug", async () => {
    const owner = await createOwner("hidden");
    const otherOwner = await createOwner("hidden-other");
    const publicationId = await createPublication(owner, `hidden-${seq}`);
    const otherPublicationId = await createPublication(otherOwner, `hidden-other-${seq}`);

    await createPost(publicationId, `hidden-draft-${seq}`);
    const deletedId = await createPost(publicationId, `hidden-deleted-${seq}`);
    await makePublished(deletedId);
    await pool.query(
      "UPDATE posts SET status = 'deleted', deleted_at = now(), published_revision_id = NULL, published_at = NULL WHERE id = $1",
      [deletedId],
    );

    expect(await resolvePostSlug(db(), publicationId, `hidden-draft-${seq}`)).toBeUndefined();
    expect(await resolvePostSlug(db(), publicationId, `hidden-deleted-${seq}`)).toBeUndefined();
    expect(await resolvePostSlug(db(), otherPublicationId, `hidden-draft-${seq}`)).toBeUndefined();
    expect(await resolvePostSlug(db(), "not-a-uuid", `hidden-draft-${seq}`)).toBeUndefined();
    expect(await resolvePostSlug(db(), publicationId, "no-such-slug")).toBeUndefined();
  });

  it("never reuses a deleted post's live address", async () => {
    const owner = await createOwner("deleted-reuse");
    const publicationId = await createPublication(owner, `deleted-reuse-${seq}`);
    const deletedId = await createPost(publicationId, `deleted-address-${seq}`);
    await pool.query(
      "UPDATE posts SET status = 'deleted', deleted_at = now() WHERE id = $1",
      [deletedId],
    );
    const newcomerId = await createPost(publicationId, `newcomer-${seq}`);

    const failure = await failureOf(
      renamePost(db(), {
        actor: { userId: owner },
        postId: newcomerId,
        slug: `deleted-address-${seq}`,
      }),
    );
    expect(failure.code).toBe("CONFLICT");
    expect(await slugOf(newcomerId)).toBe(`newcomer-${seq}`);
  });

  it("never reuses another post's historical address", async () => {
    const owner = await createOwner("history-reuse");
    const publicationId = await createPublication(owner, `history-reuse-${seq}`);
    const firstId = await createPost(publicationId, `retired-${seq}`);
    await renamePost(db(), {
      actor: { userId: owner },
      postId: firstId,
      slug: `first-now-${seq}`,
    });
    const secondId = await createPost(publicationId, `second-${seq}`);

    const failure = await failureOf(
      renamePost(db(), {
        actor: { userId: owner },
        postId: secondId,
        slug: `retired-${seq}`,
      }),
    );
    expect(failure.code).toBe("CONFLICT");
    expect(await slugOf(secondId)).toBe(`second-${seq}`);
  });

  it("lets a post return to its own previous address", async () => {
    const owner = await createOwner("return");
    const publicationId = await createPublication(owner, `return-${seq}`);
    const postId = await createPost(publicationId, `return-a-${seq}`);

    await renamePost(db(), { actor: { userId: owner }, postId, slug: `return-b-${seq}` });
    await renamePost(db(), { actor: { userId: owner }, postId, slug: `return-a-${seq}` });

    expect(await slugOf(postId)).toBe(`return-a-${seq}`);
    const history = await pool.query<{ slug: string }>(
      "SELECT slug FROM post_slug_history WHERE post_id = $1 ORDER BY slug",
      [postId],
    );
    expect(history.rows.map((row) => row.slug)).toEqual([`return-a-${seq}`, `return-b-${seq}`]);
  });

  it("is a no-op when the slug is unchanged, writing no history", async () => {
    const owner = await createOwner("noop");
    const publicationId = await createPublication(owner, `noop-${seq}`);
    const postId = await createPost(publicationId, `noop-slug-${seq}`);

    const result = await renamePost(db(), {
      actor: { userId: owner },
      postId,
      slug: `noop-slug-${seq}`,
    });
    expect(result.changed).toBe(false);
    expect(await count(pool, "post_slug_history", "WHERE post_id = $1", [postId])).toBe(0);
  });

  it("refuses a stranger, a missing post, a malformed id, a deleted post and a reserved slug", async () => {
    const owner = await createOwner("refuse");
    const stranger = await createOwner("refuse-stranger");
    const publicationId = await createPublication(owner, `refuse-${seq}`);
    const postId = await createPost(publicationId, `refuse-${seq}`);
    const deletedId = await createPost(publicationId, `refuse-deleted-${seq}`);
    await pool.query(
      "UPDATE posts SET status = 'deleted', deleted_at = now() WHERE id = $1",
      [deletedId],
    );

    expect(
      (await failureOf(renamePost(db(), { actor: { userId: stranger }, postId, slug: `x-${seq}` })))
        .code,
    ).toBe("FORBIDDEN");
    expect(
      (await failureOf(
        renamePost(db(), {
          actor: { userId: owner },
          postId: "00000000-0000-0000-0000-000000000000",
          slug: `x-${seq}`,
        }),
      )).code,
    ).toBe("NOT_FOUND");
    expect(
      (await failureOf(renamePost(db(), { actor: { userId: owner }, postId: "bad", slug: `x-${seq}` })))
        .code,
    ).toBe("NOT_FOUND");
    expect(
      (await failureOf(
        renamePost(db(), { actor: { userId: owner }, postId: deletedId, slug: `x-${seq}` }),
      )).code,
    ).toBe("CONFLICT");
    expect(
      (await failureOf(renamePost(db(), { actor: { userId: owner }, postId, slug: "admin" }))).code,
    ).toBe("VALIDATION");
  });

  it("serialises 50 concurrent renames to one winner and one history row", async () => {
    const owner = await createOwner("parallel");
    const publicationId = await createPublication(owner, `parallel-${seq}`);
    const postId = await createPost(publicationId, `parallel-old-${seq}`);

    const start = barrier(50);
    const calls = Array.from({ length: 50 }, async () => {
      await start();
      return renamePost({ kind: "db", db: testDb.db }, {
        actor: { userId: owner },
        postId,
        slug: `parallel-new-${seq}`,
      });
    });

    const results = await Promise.all(calls);
    expect(results.filter((result) => result.changed)).toHaveLength(1);
    expect(await slugOf(postId)).toBe(`parallel-new-${seq}`);
    expect(await count(pool, "post_slug_history", "WHERE post_id = $1", [postId])).toBe(1);
  }, 120_000);

  it("forced interleaving: a rename that waits for an open rename sees the committed slug", async () => {
    const owner = await createOwner("interleave");
    const publicationId = await createPublication(owner, `interleave-${seq}`);
    const postId = await createPost(publicationId, `interleave-a-${seq}`);

    let releaseFirst!: () => void;
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let announceLock!: () => void;
    const lockHeld = new Promise<void>((resolve) => {
      announceLock = resolve;
    });

    // Transaction A renames a -> b and then holds its row lock open.
    const first = testDb.db.transaction(async (tx) => {
      const result = await renamePost({ kind: "tx", tx }, {
        actor: { userId: owner },
        postId,
        slug: `interleave-b-${seq}`,
      });
      announceLock();
      await holdFirst;
      return result;
    });

    // Only after A holds the lock can B be made to wait on it.
    try {
      await lockHeld;
      let secondSettled = false;
      const second = renamePost(db(), {
        actor: { userId: owner },
        postId,
        slug: `interleave-c-${seq}`,
      }).finally(() => {
        secondSettled = true;
      });

      // Poll the server for a backend in a lock wait: B is genuinely blocked.
      await waitForLockWaiter(pool, 5_000);
      expect(secondSettled).toBe(false);

      releaseFirst();
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(firstResult.changed).toBe(true);
      expect(secondResult.changed).toBe(true);
      expect(await slugOf(postId)).toBe(`interleave-c-${seq}`);
      const history = await pool.query<{ slug: string }>(
        "SELECT slug FROM post_slug_history WHERE post_id = $1 ORDER BY slug",
        [postId],
      );
      expect(history.rows.map((row) => row.slug)).toEqual([
        `interleave-a-${seq}`,
        `interleave-b-${seq}`,
      ]);
    } finally {
      // A failed assertion must not leave A's transaction holding a connection.
      releaseFirst();
      await first.catch(() => undefined);
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
