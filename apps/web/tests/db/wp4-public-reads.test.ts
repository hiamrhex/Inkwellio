import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPublishedPostById, renamePost } from "../../src/modules/posts";
import { loadPublicPost, loadPublicPublicationFeed } from "../../src/modules/site";
import {
  DATABASE_URL,
  REQUIRED,
  createTestDatabase,
  type TestDatabase,
} from "./wp3a/harness";

/**
 * WP4 public read-path proofs against real PostgreSQL 17.
 */
describe("wp4 public reads suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "CI must provide DATABASE_URL for WP4 DB suites").toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)("WP4 public reads on real Postgres", () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let seq = 0;

  beforeAll(async () => {
    testDb = await createTestDatabase("wp4_reads");
    pool = testDb.pool;
  }, 120_000);

  afterAll(async () => {
    await testDb.close();
  });

  const db = () => ({ kind: "db" as const, db: testDb.db });

  async function seedUser(): Promise<string> {
    seq += 1;
    const res = await pool.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [`wp4-reader-${seq}@example.com`],
    );
    return res.rows[0]!.id;
  }

  async function seedPublication(ownerId: string, slug: string): Promise<string> {
    const res = await pool.query<{ id: string }>(
      "INSERT INTO publications (owner_id, slug, name) VALUES ($1, $2, $3) RETURNING id",
      [ownerId, slug, `Pub ${slug}`],
    );
    return res.rows[0]!.id;
  }

  async function seedPost(
    publicationId: string,
    slug: string,
    status: "draft" | "published" | "deleted",
    markdown = "# Hello\n\nBody text",
  ): Promise<string> {
    const postRes = await pool.query<{ id: string }>(
      "INSERT INTO posts (publication_id, slug, status) VALUES ($1, $2, 'draft') RETURNING id",
      [publicationId, slug],
    );
    const postId = postRes.rows[0]!.id;

    const revRes = await pool.query<{ id: string }>(
      "INSERT INTO post_revisions (post_id, title, body_markdown) VALUES ($1, $2, $3) RETURNING id",
      [postId, `Title ${slug}`, markdown],
    );

    if (status === "published") {
      await pool.query(
        "UPDATE posts SET status = 'published', published_revision_id = $1, published_at = now() WHERE id = $2",
        [revRes.rows[0]!.id, postId],
      );
    } else if (status === "deleted") {
      await pool.query(
        "UPDATE posts SET status = 'deleted', deleted_at = now(), published_revision_id = NULL, published_at = NULL WHERE id = $1",
        [postId],
      );
    }
    return postId;
  }

  it("loads published post content and excludes drafts/deleted posts", async () => {
    const owner = await seedUser();
    const pubSlug = `wp4-pub-${seq}`;
    const pubId = await seedPublication(owner, pubSlug);

    const publishedId = await seedPost(pubId, "live-post", "published", "# Live\n\nHello!");
    const draftId = await seedPost(pubId, "secret-draft", "draft", "Secret draft");
    const deletedId = await seedPost(pubId, "gone-post", "deleted", "Deleted body");

    const loaded = await getPublishedPostById(db(), publishedId);
    expect(loaded).toBeDefined();
    expect(loaded?.title).toBe("Title live-post");
    expect(loaded?.bodyMarkdown).toBe("# Live\n\nHello!");
    expect(loaded?.publicationSlug).toBe(pubSlug);

    expect(await getPublishedPostById(db(), draftId)).toBeUndefined();
    expect(await getPublishedPostById(db(), deletedId)).toBeUndefined();

    const feedResult = await loadPublicPublicationFeed(pubSlug, { executor: db() });
    expect(feedResult.kind).toBe("ok");
    if (feedResult.kind === "ok") {
      expect(feedResult.feed.posts.map((p) => p.slug)).toEqual(["live-post"]);
    }

    expect(
      await loadPublicPost(pubSlug, "secret-draft", { executor: db() }),
    ).toEqual({ kind: "not_found" });
  });

  it("redirects uppercase slugs and historical renamed slugs to canonical URLs", async () => {
    const owner = await seedUser();
    const pubSlug = `wp4-canon-${seq}`;
    const pubId = await seedPublication(owner, pubSlug);
    const postId = await seedPost(pubId, "original-slug", "published");

    // Uppercase handle redirects to canonical lowercase
    const upperFeed = await loadPublicPublicationFeed(pubSlug.toUpperCase(), {
      executor: db(),
    });
    expect(upperFeed).toEqual({ kind: "redirect", location: `/@${pubSlug}` });

    // Rename post -> old slug redirects to new slug
    await renamePost(db(), {
      actor: { userId: owner },
      postId,
      slug: "renamed-slug",
    });

    const oldSlugResult = await loadPublicPost(pubSlug, "original-slug", {
      executor: db(),
    });
    expect(oldSlugResult).toEqual({
      kind: "redirect",
      location: `/@${pubSlug}/renamed-slug`,
    });

    const canonicalResult = await loadPublicPost(pubSlug, "renamed-slug", {
      executor: db(),
    });
    expect(canonicalResult.kind).toBe("ok");
  });
});
