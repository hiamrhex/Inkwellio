import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Executor } from "../../src/modules/publications";
import { DATABASE_URL, REQUIRED, createTestDatabase, type TestDatabase } from "./wp3a/harness";

/**
 * WP3b write routes -> WP4 Route Handler cache invalidation, on real Postgres.
 *
 * `next/cache` is mocked to record `revalidateTag(tag, profile)` and to flag
 * any `updateTag` call. The routes must never reach for `updateTag` — Next
 * 16.4.5 throws it outside a Server Action — so the assertions below prove the
 * exact publication/slug/post-id tags and `{ expire: 0 }` profile that WP4's
 * `cache-tags.ts` defines.
 */

const cache = vi.hoisted(() => ({
  calls: [] as Array<{ tag: string; profile: unknown }>,
  updateCalls: [] as string[],
}));

vi.mock("next/cache", () => ({
  updateTag: (tag: string) => {
    cache.updateCalls.push(tag);
  },
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

vi.mock("../../src/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
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
const { POST: unpublishRoute } = await import("../../src/app/api/posts/[id]/unpublish/route");
const { POST: deleteRoute } = await import("../../src/app/api/posts/[id]/delete/route");
const { POST: restoreRoute } = await import("../../src/app/api/posts/[id]/restore/route");
const { POST: renameRoute } = await import("../../src/app/api/posts/[id]/slug/route");

describe("wp3b cache suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "CI must provide DATABASE_URL for the WP3b cache suite").toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)("WP3b write routes purge WP4 cache tags", () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let seq = 0;

  beforeAll(async () => {
    testDb = await createTestDatabase("wp3bcache");
    pool = testDb.pool;
    state.executor = { kind: "db", db: testDb.db };
  }, 120_000);

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(() => {
    cache.calls.length = 0;
    cache.updateCalls.length = 0;
  });

  async function createOwner(label: string): Promise<string> {
    seq += 1;
    const result = await pool.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [`wp3b-cache-${label}-${seq}@example.com`],
    );
    return result.rows[0]!.id;
  }

  function jsonPost(path: string, body: Record<string, unknown>): Request {
    return new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": `req-cache-${seq}` },
      body: JSON.stringify(body),
    });
  }

  function jsonPut(path: string, body: Record<string, unknown>): Request {
    return new Request(`http://localhost${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-request-id": `req-cache-put-${seq}` },
      body: JSON.stringify(body),
    });
  }

  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const tags = () => cache.calls.map((call) => call.tag);

  it("publish, rename, unpublish, delete and restore purge the right tags", async () => {
    const owner = await createOwner("lifecycle");
    state.userId = owner;

    const pubResponse = await createPublication(
      jsonPost("/api/publications", { name: `Cache route ${seq}` }),
    );
    expect(pubResponse.status).toBe(201);
    const publication = (await pubResponse.json()) as { id: string; slug: string };

    const postResponse = await createPostRoute(
      jsonPost("/api/posts", { publicationId: publication.id, slug: `cache-post-${seq}` }),
    );
    expect(postResponse.status).toBe(201);
    const post = (await postResponse.json()) as { id: string; slug: string };

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
    const publishedBody = (await published.json()) as { version: number };
    expect(tags()).toEqual([
      `publication:${publication.slug}`,
      `publication-feed:${publication.slug}`,
      `post:${publication.slug}:${post.slug}`,
      `post-id:${post.id}`,
    ]);
    expect(cache.calls[0]?.profile).toEqual({ expire: 0 });
    expect(cache.updateCalls).toEqual([]);

    cache.calls.length = 0;
    const renamed = await renameRoute(
      jsonPost(`/api/posts/${post.id}/slug`, { slug: `cache-renamed-${seq}` }),
      ctx(post.id),
    );
    expect(renamed.status).toBe(200);
    const renamedBody = (await renamed.json()) as { slug: string };
    expect(tags()).toEqual([
      `publication:${publication.slug}`,
      `publication-feed:${publication.slug}`,
      `post:${publication.slug}:${post.slug}`,
      `post-id:${post.id}`,
      `publication:${publication.slug}`,
      `publication-feed:${publication.slug}`,
      `post:${publication.slug}:${renamedBody.slug}`,
      `post-id:${post.id}`,
    ]);

    cache.calls.length = 0;
    const unpublished = await unpublishRoute(
      jsonPost(`/api/posts/${post.id}/unpublish`, { expectedVersion: publishedBody.version }),
      ctx(post.id),
    );
    expect(unpublished.status).toBe(200);
    const unpublishedBody = (await unpublished.json()) as { version: number };
    expect(tags()).toEqual([
      `publication:${publication.slug}`,
      `publication-feed:${publication.slug}`,
      `post:${publication.slug}:${renamedBody.slug}`,
      `post-id:${post.id}`,
    ]);

    cache.calls.length = 0;
    const deleted = await deleteRoute(
      jsonPost(`/api/posts/${post.id}/delete`, { expectedVersion: unpublishedBody.version }),
      ctx(post.id),
    );
    expect(deleted.status).toBe(200);
    const deletedBody = (await deleted.json()) as { version: number };
    expect(tags()).toEqual([
      `publication:${publication.slug}`,
      `publication-feed:${publication.slug}`,
      `post:${publication.slug}:${renamedBody.slug}`,
      `post-id:${post.id}`,
    ]);

    cache.calls.length = 0;
    const restored = await restoreRoute(
      jsonPost(`/api/posts/${post.id}/restore`, { expectedVersion: deletedBody.version }),
      ctx(post.id),
    );
    expect(restored.status).toBe(200);
    expect(tags()).toEqual([
      `publication:${publication.slug}`,
      `publication-feed:${publication.slug}`,
    ]);
    expect(cache.updateCalls).toEqual([]);
  });

  it("a rejected write does not purge anything", async () => {
    const owner = await createOwner("stale");
    state.userId = owner;

    const pubResponse = await createPublication(
      jsonPost("/api/publications", { name: `Cache stale ${seq}` }),
    );
    const publication = (await pubResponse.json()) as { id: string };
    const postResponse = await createPostRoute(
      jsonPost("/api/posts", { publicationId: publication.id }),
    );
    const post = (await postResponse.json()) as { id: string };

    const savedResponse = await saveDraftRoute(
      jsonPut(`/api/posts/${post.id}/draft`, {
        expectedVersion: 0,
        title: "Title",
        bodyMarkdown: "Body",
      }),
      ctx(post.id),
    );
    const saved = (await savedResponse.json()) as { version: number };

    cache.calls.length = 0;
    const stale = await publishRoute(
      jsonPost(`/api/posts/${post.id}/publish`, { expectedVersion: saved.version - 1 }),
      ctx(post.id),
    );
    expect(stale.status).toBe(409);
    expect(cache.calls).toEqual([]);
  });
});
