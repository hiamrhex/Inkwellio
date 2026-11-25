import { describe, expect, it, vi } from "vitest";

/**
 * WP3b Part 1: every write/owner route fails closed at 401 for a caller with no
 * session. Identity's session lookup is stubbed to return no session — this
 * test owns the route boundary, not the auth provider. `requireUser` runs before
 * the body is read and before any service/database call, so no session is
 * enough to prove the 401 without a real auth database.
 */

vi.mock("../src/modules/identity", () => ({
  getAuth: () => ({
    api: {
      getSession: async () => null,
    },
  }),
}));

const { POST: createPublication, GET: listPublications } = await import(
  "../src/app/api/publications/route"
);
const { GET: getPublication } = await import("../src/app/api/publications/[id]/route");
const { POST: createPostRoute } = await import("../src/app/api/posts/route");
const { GET: getDraftRoute, PUT: saveDraftRoute } = await import(
  "../src/app/api/posts/[id]/draft/route"
);
const { POST: publishRoute } = await import("../src/app/api/posts/[id]/publish/route");
const { POST: unpublishRoute } = await import("../src/app/api/posts/[id]/unpublish/route");
const { POST: deleteRoute } = await import("../src/app/api/posts/[id]/delete/route");
const { POST: restoreRoute } = await import("../src/app/api/posts/[id]/restore/route");
const { POST: renameRoute } = await import("../src/app/api/posts/[id]/slug/route");
const { PUT: setTopicsRoute } = await import("../src/app/api/posts/[id]/topics/route");

const ID = "00000000-0000-0000-0000-000000000001";
const ctx = { params: Promise.resolve({ id: ID }) };

function request(): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

type Handler = (
  request: Request,
  context?: { params: Promise<{ id: string }> },
) => Promise<Response>;

const ownerRoutes: Array<[string, Handler]> = [
  ["POST /api/publications", createPublication as Handler],
  ["GET /api/publications", listPublications as Handler],
  ["GET /api/publications/:id", getPublication as Handler],
  ["POST /api/posts", createPostRoute as Handler],
  ["GET /api/posts/:id/draft", getDraftRoute as Handler],
  ["PUT /api/posts/:id/draft", saveDraftRoute as Handler],
  ["POST /api/posts/:id/publish", publishRoute as Handler],
  ["POST /api/posts/:id/unpublish", unpublishRoute as Handler],
  ["POST /api/posts/:id/delete", deleteRoute as Handler],
  ["POST /api/posts/:id/restore", restoreRoute as Handler],
  ["POST /api/posts/:id/slug", renameRoute as Handler],
  ["PUT /api/posts/:id/topics", setTopicsRoute as Handler],
];

describe("WP3b write/owner routes fail closed at 401", () => {
  for (const [name, handler] of ownerRoutes) {
    it(`${name} -> 401 with no session`, async () => {
      const response = await handler(request(), ctx);
      expect(response.status).toBe(401);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.code).toBe("UNAUTHORIZED");
    });
  }

  it("the 401 body never carries a stack or internal detail", async () => {
    const response = await createPublication(request());
    const text = await response.text();
    expect(text).not.toMatch(/at\s+\/|Error:|drizzle|postgres|\.ts:/i);
  });
});