import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Executor } from "../../src/modules/publications";
import { DATABASE_URL, REQUIRED, createTestDatabase, type TestDatabase } from "./wp3a/harness";

/**
 * WP3b Part 1: the actual route handlers, end to end against a real Postgres.
 *
 * Only two seams are stubbed: the identity session lookup (we drive it with a
 * chosen user id) and `dbExecutor` (pointed at the isolated test schema). Every
 * other line — body parsing, requireUser, the service call, error mapping,
 * cache seam — is the shipped route code. This proves the HTTP statuses the
 * task asks for at the route boundary, not just at the service below it.
 */

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
const { POST: publishRoute } = await import("../../src/app/api/posts/[id]/publish/route");
const { POST: unpublishRoute } = await import("../../src/app/api/posts/[id]/unpublish/route");
const { POST: deleteRoute } = await import("../../src/app/api/posts/[id]/delete/route");
const { POST: restoreRoute } = await import("../../src/app/api/posts/[id]/restore/route");
const { PUT: saveDraftRoute } = await import("../../src/app/api/posts/[id]/draft/route");

describe("wp3b routes suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "CI must provide DATABASE_URL for the WP3b route suite").toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)("WP3b route handlers on a real Postgres", () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let seq = 0;

  beforeAll(async () => {
    testDb = await createTestDatabase("wp3broutes");
    pool = testDb.pool;
    state.executor = { kind: "db", db: testDb.db };
  }, 120_000);

  afterAll(async () => {
    await testDb.close();
  });

  async function createOwner(label: string): Promise<string> {
    seq += 1;
    const result = await pool.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [`wp3b-route-${label}-${seq}@example.com`],
    );
    return result.rows[0]!.id;
  }

  function jsonPost(path: string, body: Record<string, unknown>, requestId = "req-route"): Request {
    return new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": requestId },
      body: JSON.stringify(body),
    });
  }

  function jsonPut(path: string, body: Record<string, unknown>): Request {
    return new Request(`http://localhost${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-request-id": "req-route-put" },
      body: JSON.stringify(body),
    });
  }

  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("unauthenticated publish -> 401", async () => {
    state.userId = null;
    const response = await publishRoute(
      jsonPost("/api/posts/x/publish", { expectedVersion: 0 }),
      ctx("00000000-0000-0000-0000-000000000009"),
    );
    expect(response.status).toBe(401);
  });

  it("unauthenticated save-draft -> 401", async () => {
    state.userId = null;
    const response = await saveDraftRoute(
      jsonPut("/api/posts/x/draft", { expectedVersion: 0, title: "T", bodyMarkdown: "B" }),
      ctx("00000000-0000-0000-0000-000000000009"),
    );
    expect(response.status).toBe(401);
  });

  it("stranger creating a post in another owner's publication -> 403", async () => {
    const owner = await createOwner("owner");
    const stranger = await createOwner("stranger");

    state.userId = owner;
    const pubResponse = await createPublication(jsonPost("/api/publications", { name: `Route pub ${seq}` }));
    expect(pubResponse.status).toBe(201);
    const publication = (await pubResponse.json()) as { id: string };

    state.userId = stranger;
    const response = await createPostRoute(jsonPost("/api/posts", { publicationId: publication.id }));
    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("FORBIDDEN");
  });

  it("stale save-draft -> 409 with the conflict shape, through the route", async () => {
    const owner = await createOwner("stale-route");
    state.userId = owner;

    const pubResponse = await createPublication(jsonPost("/api/publications", { name: `Stale route ${seq}` }));
    const publication = (await pubResponse.json()) as { id: string };
    const postResponse = await createPostRoute(jsonPost("/api/posts", { publicationId: publication.id }));
    const post = (await postResponse.json()) as { id: string };

    const first = await saveDraftRoute(
      jsonPut(`/api/posts/${post.id}/draft`, { expectedVersion: 0, title: "Live", bodyMarkdown: "Body" }),
      ctx(post.id),
    );
    expect(first.status).toBe(200);
    const saved = (await first.json()) as { version: number };

    const stale = await saveDraftRoute(
      jsonPut(`/api/posts/${post.id}/draft`, { expectedVersion: saved.version - 1, title: "Over", bodyMarkdown: "Over" }),
      ctx(post.id),
    );
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { code: string; details: Record<string, unknown> };
    expect(body.code).toBe("CONFLICT");
    expect(body.details.currentVersion).toBe(saved.version);
  });

  it("full lifecycle through the routes: create -> save -> publish -> unpublish -> delete -> restore", async () => {
    const owner = await createOwner("lifecycle-route");
    state.userId = owner;

    const pubResponse = await createPublication(jsonPost("/api/publications", { name: `Life route ${seq}` }));
    expect(pubResponse.status).toBe(201);
    const publication = (await pubResponse.json()) as { id: string };

    const postResponse = await createPostRoute(jsonPost("/api/posts", { publicationId: publication.id }));
    expect(postResponse.status).toBe(201);
    const post = (await postResponse.json()) as { id: string };

    const savedResponse = await saveDraftRoute(
      jsonPut(`/api/posts/${post.id}/draft`, { expectedVersion: 0, title: "Title", bodyMarkdown: "Body" }),
      ctx(post.id),
    );
    expect(savedResponse.status).toBe(200);
    const saved = (await savedResponse.json()) as { version: number };

    const published = await publishRoute(
      jsonPost(`/api/posts/${post.id}/publish`, { expectedVersion: saved.version }),
      ctx(post.id),
    );
    expect(published.status).toBe(200);
    const publishedBody = (await published.json()) as { status: string; version: number };
    expect(publishedBody.status).toBe("published");

    const unpublished = await unpublishRoute(
      jsonPost(`/api/posts/${post.id}/unpublish`, { expectedVersion: publishedBody.version }),
      ctx(post.id),
    );
    expect(unpublished.status).toBe(200);
    const unpublishedBody = (await unpublished.json()) as { status: string; version: number };
    expect(unpublishedBody.status).toBe("draft");

    const deleted = await deleteRoute(
      jsonPost(`/api/posts/${post.id}/delete`, { expectedVersion: unpublishedBody.version }),
      ctx(post.id),
    );
    expect(deleted.status).toBe(200);
    const deletedBody = (await deleted.json()) as { status: string; version: number };
    expect(deletedBody.status).toBe("deleted");

    const restored = await restoreRoute(
      jsonPost(`/api/posts/${post.id}/restore`, { expectedVersion: deletedBody.version }),
      ctx(post.id),
    );
    expect(restored.status).toBe(200);
    expect(((await restored.json()) as { status: string }).status).toBe("draft");

    const row = await pool.query<{ status: string }>("SELECT status FROM posts WHERE id = $1", [post.id]);
    expect(row.rows[0]!.status).toBe("draft");
  }, 30_000);
});