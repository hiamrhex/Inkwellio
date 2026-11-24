import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ServiceError,
  fetchPublishedPage,
  getPostById,
  type FeedCursor,
} from "../../src/modules/posts";
import {
  getPublicationById,
  getPublicationBySlug,
} from "../../src/modules/publications";
import {
  DATABASE_URL,
  REQUIRED,
  createTestDatabase,
  type TestDatabase,
} from "./wp3a/harness";

/**
 * WP3a read-path proofs, against the migrated schema on a real Postgres.
 *
 * The suites are skipped only when `DATABASE_URL` is absent *and* CI did not
 * claim to run them; the environment test below turns the skip into a failure
 * in that case.
 */

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";
const MALFORMED_UUID = "definitely-not-a-uuid";

describe("wp3a reads suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "CI must provide DATABASE_URL for the WP3a suites").toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)("WP3a reads on a real Postgres", () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let seq = 0;

  beforeAll(async () => {
    testDb = await createTestDatabase("reads");
    pool = testDb.pool;
  }, 120_000);

  afterAll(async () => {
    await testDb.close();
  });

  const db = () => ({ kind: "db" as const, db: testDb.db });

  async function createOwner(label: string): Promise<string> {
    seq += 1;
    const result = await pool.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [`wp3a-read-${label}-${seq}@example.com`],
    );
    return result.rows[0]!.id;
  }

  async function createPublication(
    ownerId: string,
    slug: string,
    name = `Publication ${slug}`,
  ): Promise<string> {
    const result = await pool.query<{ id: string }>(
      "INSERT INTO publications (owner_id, slug, name) VALUES ($1, $2, $3) RETURNING id",
      [ownerId, slug, name],
    );
    return result.rows[0]!.id;
  }

  async function createDraft(publicationId: string, slug: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      "INSERT INTO posts (publication_id, slug, status) VALUES ($1, $2, 'draft') RETURNING id",
      [publicationId, slug],
    );
    return result.rows[0]!.id;
  }

  async function createPublished(
    publicationId: string,
    slug: string,
    publishedAt?: Date,
  ): Promise<string> {
    const post = await pool.query<{ id: string }>(
      "INSERT INTO posts (publication_id, slug, status) VALUES ($1, $2, 'draft') RETURNING id",
      [publicationId, slug],
    );
    const postId = post.rows[0]!.id;
    const revision = await pool.query<{ id: string }>(
      "INSERT INTO post_revisions (post_id, title, body_markdown) VALUES ($1, $2, $3) RETURNING id",
      [postId, `Title ${slug}`, `Body for ${slug}`],
    );
    await pool.query(
      "UPDATE posts SET status = 'published', published_revision_id = $1, published_at = $2 WHERE id = $3",
      [revision.rows[0]!.id, publishedAt ?? new Date("2026-06-01T12:00:00.000Z"), postId],
    );
    return postId;
  }

  async function createDeleted(publicationId: string, slug: string): Promise<string> {
    const postId = await createPublished(publicationId, slug);
    await pool.query(
      `UPDATE posts
          SET status = 'deleted',
              deleted_at = now(),
              published_revision_id = NULL,
              published_at = NULL
        WHERE id = $1`,
      [postId],
    );
    return postId;
  }

  /** Returns the thrown value so a test can compare failures exactly. */
  async function failureOf(run: Promise<unknown>): Promise<unknown> {
    return run.then(
      () => {
        throw new Error("Expected the call to fail, but it resolved");
      },
      (error: unknown) => error,
    );
  }

  function expectNotFound(error: unknown): void {
    expect(error).toBeInstanceOf(ServiceError);
    const serviceError = error as ServiceError;
    expect(serviceError.code).toBe("NOT_FOUND");
    expect(serviceError.message).toBe("Not found");
    expect(serviceError.name).toBe("ServiceError");
  }

  describe("G1: getPostById visibility matrix", () => {
    it("case 1: owner reads own draft", async () => {
      const owner = await createOwner("owner");
      const publicationId = await createPublication(owner, `case1-${seq}`);
      const postId = await createDraft(publicationId, `case1-draft-${seq}`);

      const post = await getPostById(db(), postId, { userId: owner });
      expect(post.id).toBe(postId);
      expect(post.status).toBe("draft");
      expect(post.publishedAt).toBeNull();
    });

    it("case 2: owner reads own published post", async () => {
      const owner = await createOwner("owner");
      const publicationId = await createPublication(owner, `case2-${seq}`);
      const postId = await createPublished(publicationId, `case2-published-${seq}`);

      const post = await getPostById(db(), postId, { userId: owner });
      expect(post.id).toBe(postId);
      expect(post.status).toBe("published");
      expect(post.publishedRevisionId).not.toBeNull();
      expect(post.publishedAt).not.toBeNull();
    });

    it("case 3: signed-in stranger reads a published post", async () => {
      const owner = await createOwner("owner");
      const stranger = await createOwner("stranger");
      const publicationId = await createPublication(owner, `case3-${seq}`);
      const postId = await createPublished(publicationId, `case3-published-${seq}`);

      const post = await getPostById(db(), postId, { userId: stranger });
      expect(post.id).toBe(postId);
      expect(post.status).toBe("published");
    });

    it("case 4: anonymous caller reads a published post", async () => {
      const owner = await createOwner("owner");
      const publicationId = await createPublication(owner, `case4-${seq}`);
      const postId = await createPublished(publicationId, `case4-published-${seq}`);

      const post = await getPostById(db(), postId, null);
      expect(post.id).toBe(postId);
      expect(post.status).toBe("published");
    });

    it("case 5: a draft, a deleted post, a missing id and a malformed id are one indistinguishable failure", async () => {
      const owner = await createOwner("owner");
      const stranger = await createOwner("stranger");
      const publicationId = await createPublication(owner, `case5-${seq}`);
      const draftId = await createDraft(publicationId, `case5-draft-${seq}`);
      const deletedId = await createDeleted(publicationId, `case5-deleted-${seq}`);

      const failures = await Promise.all([
        // Stranger and anonymous must not learn that the draft exists.
        failureOf(getPostById(db(), draftId, { userId: stranger })),
        failureOf(getPostById(db(), draftId, null)),
        // A soft-deleted post is not publicly visible either.
        failureOf(getPostById(db(), deletedId, { userId: stranger })),
        failureOf(getPostById(db(), deletedId, null)),
        // Missing and malformed ids fail identically, never with a driver error.
        failureOf(getPostById(db(), MISSING_UUID, null)),
        failureOf(getPostById(db(), MALFORMED_UUID, null)),
      ]);

      for (const failure of failures) expectNotFound(failure);

      // Byte-identical: same class, code, message and own property names.
      const canonical = failures[0] as ServiceError;
      for (const failure of failures) {
        const candidate = failure as ServiceError;
        expect(candidate.constructor).toBe(canonical.constructor);
        expect(Object.keys(candidate)).toEqual(Object.keys(canonical));
        expect(candidate.details).toEqual(canonical.details);
      }
    });

    it("case 5b: the owner still sees their own deleted post", async () => {
      const owner = await createOwner("owner");
      const publicationId = await createPublication(owner, `case5b-${seq}`);
      const deletedId = await createDeleted(publicationId, `case5b-deleted-${seq}`);

      const post = await getPostById(db(), deletedId, { userId: owner });
      expect(post.status).toBe("deleted");
      expect(post.deletedAt).not.toBeNull();
    });

    it("case 5c: a saved draft is still a draft, not visible because it has a revision row", async () => {
      const owner = await createOwner("owner");
      const stranger = await createOwner("stranger");
      const publicationId = await createPublication(owner, `case5c-${seq}`);
      const draftId = await createDraft(publicationId, `case5c-draft-${seq}`);

      // The state after an explicit save: a revision exists while the post is
      // still a draft. Visibility must follow `status`, never revision count.
      await pool.query(
        "INSERT INTO post_revisions (post_id, title, body_markdown) VALUES ($1, $2, $3)",
        [draftId, "Saved draft", "Saved body"],
      );

      expectNotFound(await failureOf(getPostById(db(), draftId, { userId: stranger })));
      expectNotFound(await failureOf(getPostById(db(), draftId, null)));

      const owned = await getPostById(db(), draftId, { userId: owner });
      expect(owned.status).toBe("draft");
    });
  });

  describe("G2: keyset pagination", () => {
    it("walks every page with no duplicates, no skips and strict (published_at, id) order", async () => {
      const owner = await createOwner("feed");
      const publicationId = await createPublication(owner, `feed-${seq}`);

      // Four posts share a timestamp, then two, then one: the tie-break by id
      // is exercised on both page boundaries and inside a page.
      const newest = new Date("2026-05-03T09:00:00.000Z");
      const middle = new Date("2026-05-02T09:00:00.000Z");
      const oldest = new Date("2026-05-01T09:00:00.000Z");

      const seeded: string[] = [];
      for (let i = 0; i < 4; i += 1) {
        seeded.push(await createPublished(publicationId, `feed-new-${i}-${seq}`, newest));
      }
      for (let i = 0; i < 2; i += 1) {
        seeded.push(await createPublished(publicationId, `feed-mid-${i}-${seq}`, middle));
      }
      seeded.push(await createPublished(publicationId, `feed-old-0-${seq}`, oldest));

      // A draft must never appear in the feed, even though it is in the table.
      await createDraft(publicationId, `feed-draft-${seq}`);

      const expected = await pool.query<{ id: string; published_at: Date }>(
        `SELECT id, published_at
           FROM posts
          WHERE publication_id = $1 AND status = 'published' AND deleted_at IS NULL
          ORDER BY published_at DESC, id DESC`,
        [publicationId],
      );
      expect(expected.rows).toHaveLength(seeded.length);

      const seen: Array<{ id: string; publishedAt: Date }> = [];
      let cursor: FeedCursor | undefined = undefined;
      let pages = 0;

      for (;;) {
        const page = await fetchPublishedPage(db(), publicationId, cursor, 3);
        pages += 1;
        expect(page.posts.length).toBeLessThanOrEqual(3);

        for (const item of page.posts) {
          seen.push({ id: item.id, publishedAt: item.publishedAt });
        }

        if (page.nextCursor === null) break;
        cursor = page.nextCursor;
        expect(pages).toBeLessThan(20);
      }

      // Exact total, and nothing twice.
      expect(seen).toHaveLength(expected.rows.length);
      const ids = seen.map((row) => row.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(ids)).toEqual(new Set(expected.rows.map((row) => row.id)));

      // Same sequence the database says, which proves zero skips and the
      // descending (published_at, id) ordering across page boundaries.
      expect(seen.map((row) => row.id)).toEqual(expected.rows.map((row) => row.id));

      for (let i = 1; i < seen.length; i += 1) {
        const previous = seen[i - 1]!;
        const current = seen[i]!;
        const byTime = previous.publishedAt.getTime() - current.publishedAt.getTime();
        expect(
          byTime > 0 || (byTime === 0 && previous.id > current.id),
          `row ${i} broke descending (published_at, id) order`,
        ).toBe(true);
      }

      expect(pages).toBe(3);
    });

    it("rejects a page size outside 1..50 and a malformed cursor", async () => {
      const owner = await createOwner("page-size");
      const publicationId = await createPublication(owner, `page-size-${seq}`);

      await expect(fetchPublishedPage(db(), publicationId, undefined, 0)).rejects.toMatchObject({
        code: "VALIDATION",
      });
      await expect(fetchPublishedPage(db(), publicationId, undefined, 51)).rejects.toMatchObject({
        code: "VALIDATION",
      });
      await expect(
        fetchPublishedPage(db(), publicationId, {
          publishedAt: new Date(),
          postId: MALFORMED_UUID,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("returns an empty page for a malformed publication id instead of a driver error", async () => {
      const page = await fetchPublishedPage(db(), MALFORMED_UUID, undefined, 20);
      expect(page.posts).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });
  });

  describe("G3: 10,000-row feed plan", () => {
    type PlanNode = {
      "Node Type": string;
      "Index Name"?: string;
      "Relation Name"?: string;
      Plans?: PlanNode[];
    };

    type Scan = { node: string; relation: string; index: string | null };

    function collect(node: PlanNode, scans: Scan[]): void {
      scans.push({
        node: node["Node Type"],
        relation: node["Relation Name"] ?? "",
        index: node["Index Name"] ?? null,
      });
      for (const child of node.Plans ?? []) collect(child, scans);
    }

    async function explain(indexedQuery: string, params: unknown[] = []) {
      const result = await pool.query<{ "QUERY PLAN": Array<{ Plan: PlanNode }> }>(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${indexedQuery}`,
        params,
      );
      const plan = result.rows[0]!["QUERY PLAN"][0]!.Plan;
      const scans: Scan[] = [];
      collect(plan, scans);
      return { plan, scans };
    }

    /** The access path chosen for the `posts` relation itself. A sequential
     * scan on a joined revision table is not what this gate is about. */
    function postsAccess(scans: Scan[]): Scan {
      const found = scans.find((scan) => scan.relation === "posts");
      if (found === undefined) {
        throw new Error(`the plan never touches posts: ${JSON.stringify(scans)}`);
      }
      return found;
    }

    let bulkPublicationId: string;

    beforeAll(async () => {
      const owner = await createOwner("bulk");
      bulkPublicationId = await createPublication(owner, `bulk-${seq}`);

      // 10,000 posts, four per second, so the feed has heavy timestamp ties.
      await pool.query(
        `INSERT INTO posts (publication_id, slug, status)
         SELECT $1, 'bulk-' || g, 'draft' FROM generate_series(1, 10000) AS g`,
        [bulkPublicationId],
      );
      await pool.query(
        `INSERT INTO post_revisions (post_id, title, body_markdown)
         SELECT id, 'Title ' || slug, 'Body' FROM posts WHERE publication_id = $1`,
        [bulkPublicationId],
      );
      await pool.query(
        `UPDATE posts p
            SET status = 'published',
                published_at = to_timestamp(1700000000 + (substring(p.slug from 6))::int / 4),
                published_revision_id = r.id
           FROM post_revisions r
          WHERE r.post_id = p.id AND p.publication_id = $1`,
        [bulkPublicationId],
      );

      await pool.query("ANALYZE posts");
      await pool.query("ANALYZE post_revisions");
    }, 120_000);

    it("serves both feeds from a feed index, never a sequential scan", async () => {
      const total = await pool.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM posts WHERE publication_id = $1 AND status = 'published'",
        [bulkPublicationId],
      );
      expect(Number(total.rows[0]!.n)).toBe(10_000);

      const scoped = await explain(
        `SELECT p.id, p.slug, r.title, p.published_at
           FROM posts p
           JOIN post_revisions r ON r.id = p.published_revision_id AND r.post_id = p.id
          WHERE p.publication_id = $1
            AND p.status = 'published'
            AND p.deleted_at IS NULL
            AND p.published_at IS NOT NULL
          ORDER BY p.published_at DESC, p.id DESC
          LIMIT 20`,
        [bulkPublicationId],
      );

      // Report, never weaken: a mismatch fails with the actual plan attached.
      const scopedPosts = postsAccess(scoped.scans);
      expect(scopedPosts.node, JSON.stringify(scoped.plan)).not.toBe("Seq Scan");
      expect(
        ["posts_publication_feed_idx", "posts_feed_idx"],
        `scoped feed chose ${String(scopedPosts.index)}: ${JSON.stringify(scoped.plan)}`,
      ).toContain(scopedPosts.index);

      const global = await explain(
        `SELECT id, published_at
           FROM posts
          WHERE status = 'published' AND published_at IS NOT NULL
          ORDER BY published_at DESC, id DESC
          LIMIT 20`,
      );

      const globalPosts = postsAccess(global.scans);
      expect(globalPosts.node, JSON.stringify(global.plan)).not.toBe("Seq Scan");
      expect(
        globalPosts.index,
        `global feed must name posts_feed_idx: ${JSON.stringify(global.plan)}`,
      ).toBe("posts_feed_idx");
    }, 120_000);

    it("pages the 10,000-row feed without a gap or a repeat", async () => {
      const fence = await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM posts
          WHERE publication_id = $1 AND status = 'published' AND deleted_at IS NULL`,
        [bulkPublicationId],
      );
      const expected = Number(fence.rows[0]!.n);

      const seen = new Set<string>();
      let cursor: FeedCursor | undefined = undefined;
      let calls = 0;

      for (;;) {
        const page = await fetchPublishedPage(db(), bulkPublicationId, cursor, 50);
        calls += 1;
        for (const item of page.posts) {
          expect(seen.has(item.id), `duplicate ${item.id} on page ${calls}`).toBe(false);
          seen.add(item.id);
        }
        if (page.nextCursor === null) break;
        cursor = page.nextCursor;
      }

      expect(seen.size).toBe(expected);
      // 200 full pages at 50 rows; a 200th that is exactly full costs one
      // final empty request because a page cannot know it was the last.
      expect(calls).toBeGreaterThanOrEqual(Math.ceil(expected / 50));
      expect(calls).toBeLessThanOrEqual(Math.ceil(expected / 50) + 1);
    }, 120_000);
  });

  describe("publication reads", () => {
    it("resolves a publication by its public slug for an anonymous caller", async () => {
      const owner = await createOwner("pub");
      const publicationId = await createPublication(owner, `pub-slug-${seq}`, "Public Name");

      const found = await getPublicationBySlug(db(), `pub-slug-${seq}`);
      expect(found).toEqual({ id: publicationId, slug: `pub-slug-${seq}`, name: "Public Name" });

      await expect(getPublicationBySlug(db(), `no-such-${seq}`)).resolves.toBeUndefined();
    });

    it("scopes the by-id read to the owner and hides other people's publications", async () => {
      const owner = await createOwner("pub-owner");
      const stranger = await createOwner("pub-stranger");
      const publicationId = await createPublication(owner, `pub-id-${seq}`);

      const mine = await getPublicationById(db(), publicationId, { userId: owner });
      expect(mine.id).toBe(publicationId);

      const strangerFailure = await failureOf(
        getPublicationById(db(), publicationId, { userId: stranger }),
      );
      const missingFailure = await failureOf(
        getPublicationById(db(), MISSING_UUID, { userId: stranger }),
      );
      expectNotFound(strangerFailure);
      expectNotFound(missingFailure);

      await expect(getPublicationById(db(), publicationId, null)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });
});
