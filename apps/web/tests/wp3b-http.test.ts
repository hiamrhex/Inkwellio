import { describe, expect, it } from "vitest";
import { AppError, ForbiddenError } from "../src/kernel/errors";
import { ServiceError } from "../src/modules/publications";
import { UnauthorizedError, jsonError, requestIdFrom } from "../src/app/api/_lib/respond";

/**
 * WP3b Part 1: the HTTP error boundary.
 *
 * These tests are the contract WP3a left open: a ServiceError code becomes a
 * specific HTTP status, and no internal detail (stack, SQLSTATE, constraint
 * name, driver message) reaches the body. They need no database.
 */

const REQ = "req-unit-123";

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("jsonError maps ServiceError codes to HTTP without leaking", () => {
  it("FORBIDDEN -> 403 with the kernel FORBIDDEN code and the service message", async () => {
    const response = jsonError(new ServiceError("FORBIDDEN", "You do not own this post"), REQ);
    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({
      code: "FORBIDDEN",
      message: "You do not own this post",
      requestId: REQ,
    });
  });

  it("CONFLICT -> 409 with the exact conflict details", async () => {
    const details = {
      currentVersion: 7,
      currentTitle: "Live title",
      currentBodyMarkdown: "Live body",
      updatedAt: null,
    };
    const response = jsonError(new ServiceError("CONFLICT", "The draft changed", details), REQ);
    expect(response.status).toBe(409);
    expect(await body(response)).toMatchObject({
      code: "CONFLICT",
      message: "The draft changed",
      requestId: REQ,
      details,
    });
  });

  it("NOT_FOUND -> 404 with a fixed message even if the error carried a leaky one", async () => {
    const response = jsonError(new ServiceError("NOT_FOUND", 'relation "posts" does not exist'), REQ);
    expect(response.status).toBe(404);
    const parsed = await body(response);
    expect(parsed.code).toBe("NOT_FOUND");
    expect(parsed.message).not.toContain("relation");
    expect(parsed.message).not.toContain("posts");
  });

  it("VALIDATION -> 400 with the service message", async () => {
    const response = jsonError(new ServiceError("VALIDATION", "A title is required"), REQ);
    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({ code: "VALIDATION_ERROR", message: "A title is required" });
  });

  it("UnauthorizedError -> 401 with a fixed code", async () => {
    const response = jsonError(new UnauthorizedError(), REQ);
    expect(response.status).toBe(401);
    expect(await body(response)).toMatchObject({ code: "UNAUTHORIZED", requestId: REQ });
  });

  it("a raw driver/stack error -> 500 with no leak", async () => {
    const leaked = new Error('relation "users" does not exist\n  at secret/path');
    Object.assign(leaked, { code: "42P01" });
    const response = jsonError(leaked, REQ);
    expect(response.status).toBe(500);
    const parsed = await body(response);
    const text = JSON.stringify(parsed);
    expect(text).not.toContain("users");
    expect(text).not.toContain("42P01");
    expect(text).not.toContain("secret/path");
    expect(parsed.code).toBe("INTERNAL");
    expect(parsed.requestId).toBe(REQ);
  });

  it("a kernel AppError keeps its fixed public code", async () => {
    const response = jsonError(new ForbiddenError("Forbidden"), REQ);
    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({ code: "FORBIDDEN" });
    // A generic AppError subclass with an unknown code cannot leak either.
    const odd = jsonError(new AppError("oops", "INTERNAL"), REQ);
    expect(odd.status).toBe(500);
  });
});

describe("requestIdFrom", () => {
  it("uses a valid x-request-id header verbatim", () => {
    expect(requestIdFrom(new Headers({ "x-request-id": "client-id-1" }))).toBe("client-id-1");
  });

  it("mints an id when the header is absent", () => {
    const id = requestIdFrom(new Headers());
    expect(id.length).toBeGreaterThan(0);
    expect(id.length).toBeLessThanOrEqual(64);
  });

  it("mints an id when the header is oversized (cannot become a DB audit key)", () => {
    const id = requestIdFrom(new Headers({ "x-request-id": "x".repeat(100) }));
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id).not.toBe("x".repeat(100));
  });
});