import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The WP4 cache seam, with `next/cache` under our control.
 *
 * Three Next contexts are simulated exactly:
 *   - "action"      `updateTag` works (a Server Action; the WP4 path).
 *   - "route"       `updateTag` throws its real Route Handler error, then
 *                   `revalidateTag` works (a Route Handler; the fallback).
 *   - "no-request"  both throw their real out-of-request errors (plain unit
 *                   test; nothing to invalidate, but it must be loud, not fatal).
 *   - "boom"        an unrelated `updateTag` failure must propagate.
 */

const UPDATE_TAG_OUTSIDE_ACTION =
  "updateTag can only be called from within a Server Action. To invalidate cache tags in Route Handlers or other contexts, use revalidateTag instead.";
const REVALIDATE_TAG_OUTSIDE_REQUEST =
  'Invariant: static generation store missing in revalidateTag("x")';

const h = vi.hoisted(() => ({
  mode: "action" as "action" | "route" | "no-request" | "boom",
  update: [] as string[],
  revalidate: [] as string[],
}));

vi.mock("next/cache", () => ({
  updateTag: (tag: string) => {
    if (h.mode === "route" || h.mode === "no-request") throw new Error(UPDATE_TAG_OUTSIDE_ACTION);
    if (h.mode === "boom") throw new Error("cache backend exploded");
    h.update.push(tag);
  },
  revalidateTag: (tag: string) => {
    if (h.mode === "no-request") throw new Error(REVALIDATE_TAG_OUTSIDE_REQUEST);
    h.revalidate.push(tag);
  },
  cacheTag: () => undefined,
  cacheLife: () => undefined,
}));

const seam = await import("../src/app/api/_lib/cache-seam");

const target = {
  postId: "11111111-1111-4111-8111-111111111111",
  publicationSlug: "Pub-One",
  postSlug: "Old-Slug",
};

const POST_TAGS = [
  "publication:pub-one",
  "publication-feed:pub-one",
  "post:pub-one:old-slug",
  "post-id:11111111-1111-4111-8111-111111111111",
];

const FEED_TAGS = ["publication:pub-one", "publication-feed:pub-one"];

describe("WP4 cache seam", () => {
  beforeEach(() => {
    h.mode = "action";
    h.update.length = 0;
    h.revalidate.length = 0;
  });

  it("in a Server Action, uses WP4's updateTag with the post's exact tags", async () => {
    await seam.invalidatePublishedPost(target);
    expect(h.update).toEqual(POST_TAGS);
    expect(h.revalidate).toEqual([]);
  });

  it("in a Route Handler, falls back to revalidateTag with the same tags", async () => {
    h.mode = "route";
    await seam.invalidatePublishedPost(target);
    expect(h.update).toEqual([]);
    expect(h.revalidate).toEqual(POST_TAGS);
  });

  it("invalidatePublicationFeed purges only the publication tags", async () => {
    await seam.invalidatePublicationFeed(target);
    expect(h.update).toEqual(FEED_TAGS);
  });

  it("a rename purges the retired and the new address", async () => {
    await seam.invalidatePostSlug(target, { ...target, postSlug: "New-Slug" });
    expect(h.update).toEqual([
      ...POST_TAGS,
      "publication:pub-one",
      "publication-feed:pub-one",
      "post:pub-one:new-slug",
      "post-id:11111111-1111-4111-8111-111111111111",
    ]);
  });

  it("outside a Next request scope it warns once and does not throw", async () => {
    h.mode = "no-request";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(seam.invalidatePublishedPost(target)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("cache_invalidation_skipped");
    } finally {
      warn.mockRestore();
    }
  });

  it("does not swallow an unexpected updateTag failure", async () => {
    h.mode = "boom";
    await expect(seam.invalidatePublishedPost(target)).rejects.toThrow("cache backend exploded");
    expect(h.revalidate).toEqual([]);
  });
});
