import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SEED_TOPICS,
  fetchTopicPublishedPage,
  getTopicBySlug,
  listTopics,
  seedTopics,
} from "../../src/modules/topics";
import { searchPublishedPosts } from "../../src/modules/search";
import {
  DATABASE_URL,
  REQUIRED,
  count,
  createTestDatabase,
  type TestDatabase,
} from "./wp3a/harness";

/**
 * WP5 integration proofs against real PostgreSQL 17:
 * - Idempotent topic seeding
 * - Topic filtering returning published posts only
 * - Bounded, parameterized, published-only search (drafts and deleted excluded)
 */
describe("wp5 topics & search suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "CI must provide DATABASE_URL for WP5 DB suites").toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)("WP5 seeded topics and bounded search on Postgres", () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let seq = 0;

  beforeAll(async () => {
    testDb = await createTestDatabase("wp5_topics_search");
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
      [`wp5-author-${seq}@example.com`],
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

  async function seedPost(input: {
    publicationId: string;
    slug: string;
    status: "draft" | "published" | "deleted";
    title: string;
    bodyMarkdown: string;
    publishedAt?: Date;
    topicSlugs?: string[];
  }): Promise<string> {
    const postRes = await pool.query<{ id: string }>(
      "INSERT INTO posts (publication_id, slug, status) VALUES ($1, $2, 'draft') RETURNING id",
      [input.publicationId, input.slug],
    );
    const postId = postRes.rows[0]!.id;

    const revRes = await pool.query<{ id: string }>(
      "INSERT INTO post_revisions (post_id, title, body_markdown) VALUES ($1, $2, $3) RETURNING id",
      [postId, input.title, input.bodyMarkdown],
    );

    if (input.status === "published") {
      await pool.query(
        "UPDATE posts SET status = 'published', published_revision_id = $1, published_at = $2 WHERE id = $3",
        [revRes.rows[0]!.id, input.publishedAt ?? new Date(), postId],
      );
    } else if (input.status === "deleted") {
      await pool.query(
        "UPDATE posts SET status = 'deleted', deleted_at = now(), published_revision_id = NULL, published_at = NULL WHERE id = $1",
        [postId],
      );
    }

    for (const slug of input.topicSlugs ?? []) {
      const topicRow = await pool.query<{ id: string }>(
        "SELECT id FROM topics WHERE slug = $1",
        [slug],
      );
      if (topicRow.rows[0]) {
        await pool.query(
          "INSERT INTO post_topics (post_id, topic_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [postId, topicRow.rows[0].id],
        );
      }
    }
    return postId;
  }

  it("seedTopics is idempotent across repeated invocations", async () => {
    const first = await seedTopics(db());
    expect(first.length).toBe(SEED_TOPICS.length);
    expect(await count(pool, "topics")).toBe(SEED_TOPICS.length);

    const second = await seedTopics(db());
    expect(second.length).toBe(SEED_TOPICS.length);
    expect(await count(pool, "topics")).toBe(SEED_TOPICS.length);

    const tactics = await getTopicBySlug(db(), "tactics");
    expect(tactics).toMatchObject({ slug: "tactics", name: "Tactics" });
  });

  it("excludes drafts and deleted posts from both topic listings and search results", async () => {
    await seedTopics(db());
    const owner = await seedUser();
    const pubId = await seedPublication(owner, "touchline-notes");

    await seedPost({
      publicationId: pubId,
      slug: "midfield-diamond-published",
      status: "published",
      title: "Midfield Diamond Pressing Analysis",
      bodyMarkdown: "Published tactical note on 4-4-2 diamond counter-pressing.",
      publishedAt: new Date("2026-10-01T12:00:00Z"),
      topicSlugs: ["tactics"],
    });

    await seedPost({
      publicationId: pubId,
      slug: "midfield-diamond-draft",
      status: "draft",
      title: "Midfield Diamond Pressing Secret Draft",
      bodyMarkdown: "Unpublished counter-pressing draft that must never leak.",
      topicSlugs: ["tactics"],
    });

    await seedPost({
      publicationId: pubId,
      slug: "midfield-diamond-deleted",
      status: "deleted",
      title: "Midfield Diamond Pressing Deleted",
      bodyMarkdown: "Deleted counter-pressing article that must never leak.",
      topicSlugs: ["tactics"],
    });

    const topics = await listTopics(db());
    const tacticsSummary = topics.find((t) => t.slug === "tactics");
    expect(tacticsSummary?.publishedCount).toBe(1);

    const topicPage = await fetchTopicPublishedPage(db(), "tactics");
    expect(topicPage?.posts.map((p) => p.slug)).toEqual([
      "midfield-diamond-published",
    ]);

    const searchResult = await searchPublishedPosts(db(), {
      query: "Diamond Pressing",
    });
    expect(searchResult.items.map((p) => p.slug)).toEqual([
      "midfield-diamond-published",
    ]);
  });

  it("enforces bounded keyset pagination, topic filters, and safe wildcard escaping", async () => {
    await seedTopics(db());
    const owner = await seedUser();
    const pubId = await seedPublication(owner, "matchday-analytics");

    await seedPost({
      publicationId: pubId,
      slug: "xg-model-part-1",
      status: "published",
      title: "Expected Goals Part 1",
      bodyMarkdown: "Expected goals shot quality baseline.",
      publishedAt: new Date("2026-10-02T10:00:00Z"),
      topicSlugs: ["analytics"],
    });
    await seedPost({
      publicationId: pubId,
      slug: "xg-model-part-2",
      status: "published",
      title: "Expected Goals Part 2",
      bodyMarkdown: "Expected goals transition calibration 100%.",
      publishedAt: new Date("2026-10-03T10:00:00Z"),
      topicSlugs: ["analytics"],
    });
    await seedPost({
      publicationId: pubId,
      slug: "transfer-expected-goals",
      status: "published",
      title: "Transfer Expected Goals Fit",
      bodyMarkdown: "Expected goals used in recruitment.",
      publishedAt: new Date("2026-10-04T10:00:00Z"),
      topicSlugs: ["transfers"],
    });

    // Topic filter isolates analytics posts only
    const page1 = await searchPublishedPosts(db(), {
      query: "Expected Goals",
      topicSlug: "analytics",
      pageSize: 1,
    });
    expect(page1.items.map((i) => i.slug)).toEqual(["xg-model-part-2"]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await searchPublishedPosts(db(), {
      query: "Expected Goals",
      topicSlug: "analytics",
      cursor: page1.nextCursor ?? undefined,
      pageSize: 1,
    });
    expect(page2.items.map((i) => i.slug)).toEqual(["xg-model-part-1"]);
    expect(page2.nextCursor).toBeNull();

    // Wildcard '%' must match literal '%' only, not act as wildcard matching all posts
    const percentMatch = await searchPublishedPosts(db(), { query: "100%" });
    expect(percentMatch.items.map((i) => i.slug)).toEqual(["xg-model-part-2"]);

    // SQL injection attempt safely parameterized
    const injection = await searchPublishedPosts(db(), {
      query: "'; DROP TABLE posts; --",
    });
    expect(injection.items).toEqual([]);
    expect(await count(pool, "posts")).toBeGreaterThanOrEqual(3);
  });
});
