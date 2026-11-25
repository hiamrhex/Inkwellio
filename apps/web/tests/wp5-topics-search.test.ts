import { describe, expect, it } from "vitest";
import {
  SEED_TOPICS,
  getTopicBySlug,
  listTopics,
  seedTopics,
} from "../src/modules/topics";
import {
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
  SEARCH_QUERY_MAX_LENGTH,
  escapeLikePattern,
  parseSearchPageSize,
  parseSearchQuery,
  searchPublishedPosts,
} from "../src/modules/search";
import { GET as searchGet } from "../src/app/api/search/route";
import { GET as topicsGet } from "../src/app/api/topics/route";
import type { Executor, Queryable } from "../src/modules/posts";
import { ServiceError } from "../src/modules/posts";

function rejectingExecutor(error: Error): Executor {
  const tx: Queryable = {
    execute() {
      return Promise.reject(error);
    },
  };
  return { kind: "tx", tx };
}

describe("WP5: Seeded Topics & Search Validation", () => {
  it("SEED_TOPICS contains curated generic football writing topics with valid slugs & names", () => {
    expect(SEED_TOPICS.length).toBeGreaterThanOrEqual(8);
    const seenSlugs = new Set<string>();
    for (const topic of SEED_TOPICS) {
      expect(topic.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(topic.slug.length).toBeGreaterThanOrEqual(1);
      expect(topic.slug.length).toBeLessThanOrEqual(64);
      expect(topic.name.length).toBeGreaterThanOrEqual(1);
      expect(topic.name.length).toBeLessThanOrEqual(40);
      expect(seenSlugs.has(topic.slug)).toBe(false);
      seenSlugs.add(topic.slug);
    }
  });

  it("parseSearchQuery enforces non-empty trimmed 1..100 length cap and rejects control characters", () => {
    expect(parseSearchQuery("  high press  ")).toBe("high press");
    expect(parseSearchQuery("a".repeat(SEARCH_QUERY_MAX_LENGTH))).toHaveLength(
      SEARCH_QUERY_MAX_LENGTH,
    );

    expect(() => parseSearchQuery("")).toThrow(ServiceError);
    expect(() => parseSearchQuery("   ")).toThrow(ServiceError);
    expect(() => parseSearchQuery("a".repeat(SEARCH_QUERY_MAX_LENGTH + 1))).toThrow(
      ServiceError,
    );
    expect(() => parseSearchQuery("tactics\x00drop")).toThrow(ServiceError);
    expect(() => parseSearchQuery("tactics\ninject")).toThrow(ServiceError);
  });

  it("parseSearchPageSize enforces integer bounds 1..50", () => {
    expect(parseSearchPageSize(undefined)).toBe(SEARCH_PAGE_SIZE_DEFAULT);
    expect(parseSearchPageSize(1)).toBe(1);
    expect(parseSearchPageSize(SEARCH_PAGE_SIZE_MAX)).toBe(SEARCH_PAGE_SIZE_MAX);

    expect(() => parseSearchPageSize(0)).toThrow(ServiceError);
    expect(() => parseSearchPageSize(-5)).toThrow(ServiceError);
    expect(() => parseSearchPageSize(SEARCH_PAGE_SIZE_MAX + 1)).toThrow(ServiceError);
    expect(() => parseSearchPageSize(10.5)).toThrow(ServiceError);
    expect(() => parseSearchPageSize(Number.NaN)).toThrow(ServiceError);
  });

  it("escapeLikePattern escapes LIKE wildcards (%, _, \\) literally", () => {
    expect(escapeLikePattern("100% pass_rate\\ok")).toBe(
      "100\\% pass\\_rate\\\\ok",
    );
  });

  it("getTopicBySlug and searchPublishedPosts reject invalid slugs without hitting DB", async () => {
    const neverDb = rejectingExecutor(new Error("Should not hit DB"));
    expect(await getTopicBySlug(neverDb, "Bad--Slug")).toBeUndefined();
    expect(await getTopicBySlug(neverDb, "")).toBeUndefined();

    await expect(
      searchPublishedPosts(neverDb, {
        query: "tactics",
        topicSlug: "bad--topic",
      }),
    ).rejects.toThrow(ServiceError);
  });

  it("listTopics & seedTopics propagate executor cleanly", async () => {
    const err = new Error("db unreachable");
    await expect(listTopics(rejectingExecutor(err))).rejects.toThrow(err);
    await expect(seedTopics(rejectingExecutor(err))).rejects.toThrow(err);
  });

  it("searchPublishedPosts uses limit+1 lookahead so exact-full final pages return nextCursor: null", async () => {
    const row1 = {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "post-1",
      title: "Post 1",
      body_markdown: "tactics",
      published_at: "2026-10-03T10:00:00.000Z",
      publication_slug: "pub",
      publication_name: "Pub",
    };
    const row2 = {
      id: "00000000-0000-4000-8000-000000000002",
      slug: "post-2",
      title: "Post 2",
      body_markdown: "tactics",
      published_at: "2026-10-02T10:00:00.000Z",
      publication_slug: "pub",
      publication_name: "Pub",
    };

    const twoRowsExecutor: Executor = {
      kind: "tx",
      tx: {
        execute: async () => ({ rows: [row1, row2] }),
      },
    };
    const oneRowExecutor: Executor = {
      kind: "tx",
      tx: {
        execute: async () => ({ rows: [row2] }),
      },
    };

    const page1 = await searchPublishedPosts(twoRowsExecutor, {
      query: "tactics",
      pageSize: 1,
    });
    expect(page1.items.map((i) => i.slug)).toEqual(["post-1"]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await searchPublishedPosts(oneRowExecutor, {
      query: "tactics",
      pageSize: 1,
    });
    expect(page2.items.map((i) => i.slug)).toEqual(["post-2"]);
    expect(page2.nextCursor).toBeNull();
  });
});

describe("WP5: Public HTTP Route Boundaries (/api/search and /api/topics)", () => {
  it("GET /api/search rejects missing, oversized, or out-of-range parameters with 400 VALIDATION_ERROR", async () => {
    const missingQ = await searchGet(new Request("http://localhost/api/search"));
    expect(missingQ.status).toBe(400);
    const missingBody = (await missingQ.json()) as {
      error: { code: string; status: number; requestId: string };
    };
    expect(missingBody.error.code).toBe("VALIDATION_ERROR");
    expect(missingBody.error.requestId).toBeTruthy();

    const oversizedQ = await searchGet(
      new Request(
        `http://localhost/api/search?q=${"x".repeat(SEARCH_QUERY_MAX_LENGTH + 1)}`,
      ),
    );
    expect(oversizedQ.status).toBe(400);

    const overLimit = await searchGet(
      new Request("http://localhost/api/search?q=tactics&limit=51"),
    );
    expect(overLimit.status).toBe(400);

    const zeroLimit = await searchGet(
      new Request("http://localhost/api/search?q=tactics&limit=0"),
    );
    expect(zeroLimit.status).toBe(400);
  });

  it("GET /api/search returns clean 503 UNAVAILABLE when DATABASE_URL is unset without leaking internals", async () => {
    const origUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const res = await searchGet(
        new Request("http://localhost/api/search?q=tactics&limit=10"),
      );
      expect(res.status).toBe(503);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      const body = (await res.json()) as {
        error: { code: string; message: string; requestId: string };
      };
      expect(body.error.code).toBe("UNAVAILABLE");
      expect(body.error.message).toBe("Temporarily unavailable");
      expect(body.error.message).not.toContain("DATABASE_URL");
    } finally {
      if (origUrl !== undefined) {
        process.env.DATABASE_URL = origUrl;
      }
    }
  });

  it("GET /api/topics returns clean 503 UNAVAILABLE when DATABASE_URL is unset", async () => {
    const origUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const res = await topicsGet();
      expect(res.status).toBe(503);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      const body = (await res.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe("UNAVAILABLE");
      expect(body.error.message).toBe("Temporarily unavailable");
    } finally {
      if (origUrl !== undefined) {
        process.env.DATABASE_URL = origUrl;
      }
    }
  });
});
