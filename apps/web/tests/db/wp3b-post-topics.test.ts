import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Executor } from "../../src/modules/publications";
import { seedTopics } from "../../src/modules/topics";
import { DATABASE_URL, REQUIRED, createTestDatabase, type TestDatabase } from "./wp3a/harness";

/**
 * WP3b topic assignment: `PUT /api/posts/:id/topics` on real Postgres.
 *
 * The route, body parsing, ownership check and service transaction are the
 * shipped code; only the identity session lookup, the executor and `next/cache`
 * are stubbed. Each case asserts both the HTTP status and the rows left in
 * `post_topics`, because "no change" is the half of atomic replacement a status
 * code cannot prove.
 */

const cache = vi.hoisted(() => ({
  calls: [] as Array<{ tag: string; profile: unknown }>,
}));

vi.mock("next/cache", () => ({
  updateTag: () => undefined,
  revalidateTag: (tag: string, profile: unknown) => {
    cache.calls.push({ tag, profile });
  },
  cacheTag: () => undefined,
  cacheLife: () => undefined,
}));

const state = vi.hoisted(() => ({
  userId: null as string | null,
  executor: null as unknown as Executor,
}));

vi.mock("../../src/modules/identity", () => ({
  getAuth: () => ({
    api: {
      getSession: async () => (state.userId === null ? null : { user: { id: state.userId } }),
    },
  }),
}));

vi.mock("../../src/app/api/_lib/executor", () => ({
  dbExecutor: () => state.executor,
}));

const { POST: createPublication } = await import("../../src/app/api/publications/route");
const { POST: createPostRoute } = await import("../../src/app/api/posts/route");
const { PUT: saveDraftRoute } = await import("../../src/app/api/posts/[id]/draft/route");
const { POST: publishRoute } = await import("../../src/app/api/posts/[id]/publish/route");
const { PUT: setTopicsRoute } = await import("../../src/app/api/posts/[id]/topics/route");

describe("wp3b post-topics suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "CI must provide DATABASE_URL for the post-topics suite").toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)("PUT /api/posts/:id/topics on a real Postgres", () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let seq = 0;

  beforeAll(async () => {
    testDb = await createTestDatabase("wp3bposttopics");
    pool = testDb.pool;
    state.executor = { kind: "db", db: testDb.db };
    await seedTopics(state.executor);
  }, 120_000);

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(() => {
    cache.calls.length = 0;
  });

  async function createOwner(label: string): Promise<string> {
    seq += 1;
    const result = await pool.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [`wp3b-topics-${label}-${seq}@example.com`],
    );
    return result.rows[0]!.id;
  }

  function jsonPost(path: string, body: Record<string, unknown>): Request {
    return new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": `req-topics-${seq}` },
      body: JSON.stringify(body),
    });
  }

  function jsonPut(path: string, body: Record<string, unknown>): Request {
    return new Request(`http://localhost${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-request-id": `req-topics-put-${seq}` },
      body: JSON.stringify(body),
    });
  }

  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const tags = () => cache.calls.map((call) => call.tag);

  type CreatedPost = { id: string; slug: string; publicationSlug: string; owner: string };

  async function createPost(label: string): Promise<CreatedPost> {
    const owner = await createOwner(label);
    state.userId = owner;

    const pubResponse = await createPublication(
      jsonPost("/api/publications", { name: `Topics pub ${label} ${seq}` }),
    );
    expect(pubResponse.status).toBe(201);
    const publication = (await pubResponse.json()) as { id: string; slug: string };

    const postResponse = await createPostRoute(
      jsonPost("/api/posts", { publicationId: publication.id }),
    );
    expect(postResponse.status).toBe(201);
    const post = (await postResponse.json()) as { id: string; slug: string };

    return { id: post.id, slug: post.slug, publicationSlug: publication.slug, owner };
  }

  async function publish(post: CreatedPost): Promise<void> {
    const savedResponse = await saveDraftRoute(
      jsonPut(`/api/posts/${post.id}/draft`, {
        expectedVersion: 0,
        title: "Title",
        bodyMarkdown: "Body",
      }),
      ctx(post.id),
    );
    expect(savedResponse.status).toBe(200);
    const saved = (await savedResponse.json()) as { version: number };

    const published = await publishRoute(
      jsonPost(`/api/posts/${post.id}/publish`, { expectedVersion: saved.version }),
      ctx(post.id),
    );
    expect(published.status).toBe(200);
    cache.calls.length = 0;
  }

  async function topicSlugsFor(postId: string): Promise<string[]> {
    const result = await pool.query<{ slug: string }>(
      `SELECT t.slug
         FROM post_topics pt
         JOIN topics t ON t.id = pt.topic_id
        WHERE pt.post_id = $1
        ORDER BY t.slug`,
      [postId],
    );
    return result.rows.map((row) => row.slug);
  }

  it("assigns curated topics, replaces the whole set, and clears it with an empty array", async () => {
    const post = await createPost("replace");

    const first = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, { topicSlugs: ["tactics", "analytics"] }),
      ctx(post.id),
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      postId: string;
      status: string;
      topics: Array<{ slug: string }>;
    };
    expect(firstBody.postId).toBe(post.id);
    expect(firstBody.status).toBe("draft");
    expect(firstBody.topics.map((topic) => topic.slug)).toEqual(["tactics", "analytics"]);
    expect(await topicSlugsFor(post.id)).toEqual(["analytics", "tactics"]);

    const second = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, { topicSlugs: ["transfers"] }),
      ctx(post.id),
    );
    expect(second.status).toBe(200);
    expect(await topicSlugsFor(post.id)).toEqual(["transfers"]);

    const cleared = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, { topicSlugs: [] }),
      ctx(post.id),
    );
    expect(cleared.status).toBe(200);
    expect(await topicSlugsFor(post.id)).toEqual([]);

    // A draft page is not public cache, so nothing is purged.
    expect(cache.calls).toEqual([]);
  });

  it("normalises slugs and collapses duplicates instead of failing on the composite key", async () => {
    const post = await createPost("dedupe");

    const response = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, {
        topicSlugs: ["Tactics ", "tactics", "ANALYTICS"],
      }),
      ctx(post.id),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { topics: Array<{ slug: string }> };
    expect(body.topics.map((topic) => topic.slug)).toEqual(["tactics", "analytics"]);
    expect(await topicSlugsFor(post.id)).toEqual(["analytics", "tactics"]);
  });

  it("refuses a fourth distinct topic and leaves the previous set untouched", async () => {
    const post = await createPost("max");

    const assigned = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, { topicSlugs: ["tactics"] }),
      ctx(post.id),
    );
    expect(assigned.status).toBe(200);

    const rejected = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, {
        topicSlugs: ["tactics", "analytics", "transfers", "coaching"],
      }),
      ctx(post.id),
    );
    expect(rejected.status).toBe(400);
    const body = (await rejected.json()) as { code: string; message: string };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("at most 3 topics");
    expect(await topicSlugsFor(post.id)).toEqual(["tactics"]);
  });

  it("an unknown curated slug is a 400 and never applies the partial set", async () => {
    const post = await createPost("unknown");

    const assigned = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, { topicSlugs: ["tactics"] }),
      ctx(post.id),
    );
    expect(assigned.status).toBe(200);

    const rejected = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, { topicSlugs: ["analytics", "not-a-real-topic"] }),
      ctx(post.id),
    );
    expect(rejected.status).toBe(400);
    const body = (await rejected.json()) as { code: string; message: string };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("Unknown topic");
    expect(await topicSlugsFor(post.id)).toEqual(["tactics"]);
  });

  it("a non-array body is a 400 before the service runs", async () => {
    const post = await createPost("body");

    const response = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, { topicSlugs: "tactics" }),
      ctx(post.id),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
    expect(await topicSlugsFor(post.id)).toEqual([]);
  });

  it("a stranger is 403 and cannot change the owner's topics", async () => {
    const post = await createPost("stranger");
    const stranger = await createOwner("stranger-other");

    const assigned = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, { topicSlugs: ["tactics"] }),
      ctx(post.id),
    );
    expect(assigned.status).toBe(200);

    state.userId = stranger;
    const response = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, { topicSlugs: ["transfers"] }),
      ctx(post.id),
    );
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe("FORBIDDEN");
    expect(await topicSlugsFor(post.id)).toEqual(["tactics"]);
  });

  it("a missing, malformed or deleted post is 404 for its own owner", async () => {
    const post = await createPost("missing");
    state.userId = post.owner;

    const missing = await setTopicsRoute(
      jsonPut("/api/posts/00000000-0000-0000-0000-0000000000ff/topics", {
        topicSlugs: ["tactics"],
      }),
      ctx("00000000-0000-0000-0000-0000000000ff"),
    );
    expect(missing.status).toBe(404);

    const malformed = await setTopicsRoute(
      jsonPut("/api/posts/not-a-uuid/topics", { topicSlugs: ["tactics"] }),
      ctx("not-a-uuid"),
    );
    expect(malformed.status).toBe(404);

    await pool.query("UPDATE posts SET status = 'deleted', deleted_at = now() WHERE id = $1", [
      post.id,
    ]);
    const deleted = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, { topicSlugs: ["tactics"] }),
      ctx(post.id),
    );
    expect(deleted.status).toBe(404);
    expect(((await deleted.json()) as { code: string }).code).toBe("NOT_FOUND");
    expect(await topicSlugsFor(post.id)).toEqual([]);
  });

  it("a published post purges the exact WP4 tags; a rejected assignment purges nothing", async () => {
    const post = await createPost("published");
    await publish(post);

    const response = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, { topicSlugs: ["tactics", "analytics"] }),
      ctx(post.id),
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { status: string }).status).toBe("published");
    expect(tags()).toEqual([
      `publication:${post.publicationSlug}`,
      `publication-feed:${post.publicationSlug}`,
      `post:${post.publicationSlug}:${post.slug}`,
      `post-id:${post.id}`,
    ]);
    expect(cache.calls.every((call) => JSON.stringify(call.profile) === '{"expire":0}')).toBe(true);

    cache.calls.length = 0;
    const rejected = await setTopicsRoute(
      jsonPut(`/api/posts/${post.id}/topics`, { topicSlugs: ["not-a-real-topic"] }),
      ctx(post.id),
    );
    expect(rejected.status).toBe(400);
    expect(cache.calls).toEqual([]);
  });
});
