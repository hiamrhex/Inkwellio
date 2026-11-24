import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toPublicError } from "../src/kernel/errors";
import type { Executor, Queryable } from "../src/modules/posts";
import {
  PublicReadUnavailableError,
  READ_TIMEOUT_MS,
  ReadTimeoutError,
  loadPublicPost,
  loadPublicPublicationFeed,
  postByIdTag,
  postTag,
  publicationFeedTag,
  publicationTag,
  withReadTimeout,
} from "../src/modules/site";

function hangingExecutor(delayMs: number): Executor {
  const tx: Queryable = {
    execute() {
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ rows: [] }), delayMs);
        timer.unref?.();
      });
    },
  };
  return { kind: "tx", tx };
}

function failingExecutor(error: Error): Executor {
  const tx: Queryable = {
    execute() {
      return Promise.reject(error);
    },
  };
  return { kind: "tx", tx };
}

describe("WP4 / A9: Bounded DB timeouts and clean unavailability on read path", () => {
  it("default READ_TIMEOUT_MS is bounded inside Vercel's 300s ceiling (15s per A9)", () => {
    expect(READ_TIMEOUT_MS).toBe(15_000);
    expect(READ_TIMEOUT_MS).toBeLessThan(30_000);
  });

  it("withReadTimeout aborts a 10s-hanging DB call cleanly within the budget", async () => {
    const start = performance.now();
    let caught: unknown;
    try {
      await withReadTimeout(
        () => new Promise((resolve) => setTimeout(resolve, 10_000).unref?.()),
        60,
      );
    } catch (err) {
      caught = err;
    }
    const elapsed = performance.now() - start;

    expect(caught).toBeInstanceOf(ReadTimeoutError);
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(1000);

    const pubErr = toPublicError(caught, "req-timeout-1");
    expect(pubErr).toEqual({
      code: "UNAVAILABLE",
      status: 503,
      message: "Temporarily unavailable",
      requestId: "req-timeout-1",
    });
  });

  it("loadPublicPublicationFeed times out cleanly against a hanging DB executor", async () => {
    const start = performance.now();
    let caught: unknown;
    try {
      await loadPublicPublicationFeed("alice", {
        executor: hangingExecutor(10_000),
        timeoutMs: 60,
      });
    } catch (err) {
      caught = err;
    }
    const elapsed = performance.now() - start;

    expect(caught).toBeInstanceOf(ReadTimeoutError);
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(1000);
  });

  it("loadPublicPost times out cleanly against a hanging DB executor", async () => {
    const start = performance.now();
    let caught: unknown;
    try {
      await loadPublicPost("alice", "hello-world", {
        executor: hangingExecutor(10_000),
        timeoutMs: 60,
      });
    } catch (err) {
      caught = err;
    }
    const elapsed = performance.now() - start;

    expect(caught).toBeInstanceOf(ReadTimeoutError);
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(1000);
  });

  it("normalizes raw driver/socket failures without leaking connection strings", async () => {
    const rawDriverError = new Error(
      "connect ECONNREFUSED postgres://admin:supersecret@db.internal:5432/inkwellio",
    );
    let caught: unknown;
    try {
      await loadPublicPublicationFeed("alice", {
        executor: failingExecutor(rawDriverError),
        timeoutMs: 1000,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PublicReadUnavailableError);
    const pubErr = toPublicError(caught, "req-db-down-1");
    expect(pubErr).toEqual({
      code: "UNAVAILABLE",
      status: 503,
      message: "Temporarily unavailable",
      requestId: "req-db-down-1",
    });
    expect(pubErr.message).not.toContain("supersecret");
    expect(pubErr.message).not.toContain("ECONNREFUSED");
  });

  it("rejects malformed or reserved slugs with not_found without querying DB", async () => {
    const neverTouchDb = failingExecutor(new Error("Should not hit DB"));
    expect(await loadPublicPublicationFeed("admin", { executor: neverTouchDb })).toEqual({
      kind: "not_found",
    });
    expect(await loadPublicPublicationFeed("bad--slug", { executor: neverTouchDb })).toEqual({
      kind: "not_found",
    });
    expect(
      await loadPublicPost("alice", "UPPER--INVALID", { executor: neverTouchDb }),
    ).toEqual({ kind: "not_found" });
  });

  it("normalizes cache tags cleanly for updateTag() invalidation", () => {
    expect(publicationTag("Alice")).toBe("publication:alice");
    expect(publicationFeedTag("Alice")).toBe("publication-feed:alice");
    expect(postTag("Alice", "Hello-World")).toBe("post:alice:hello-world");
    expect(postByIdTag("post-uuid-1")).toBe("post-id:post-uuid-1");
  });

  it("cached-reads uses 'use cache', cacheLife, and cacheTag directives", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const cachedReadsSrc = fs.readFileSync(
      path.resolve(testDir, "../src/modules/site/cached-reads.ts"),
      "utf8",
    );
    expect(cachedReadsSrc).toContain('"use cache"');
    expect(cachedReadsSrc).toContain('cacheLife("feed")');
    expect(cachedReadsSrc).toContain('cacheLife("post")');
    expect(cachedReadsSrc).toContain("cacheTag(");
  });

  it("public routes explicitly disable automatic link prefetching (Neon CU protection)", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const pubPage = fs.readFileSync(
      path.resolve(testDir, "../src/app/p/[handle]/page.tsx"),
      "utf8",
    );
    const postPage = fs.readFileSync(
      path.resolve(testDir, "../src/app/p/[handle]/[slug]/page.tsx"),
      "utf8",
    );
    expect(pubPage).toContain("prefetch={false}");
    expect(postPage).toContain("prefetch={false}");
  });
});
