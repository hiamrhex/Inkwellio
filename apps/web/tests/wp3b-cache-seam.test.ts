import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The WP3b -> WP4 Route Handler seam, with `next/cache` under our control.
 *
 * Next 16.4.5's `revalidateTag(tag, profile)` requires the second argument and
 * the bundled docs direct Route Handlers to `{ expire: 0 }` for immediate
 * expiry. These tests pin the exact tag list and profile the seam emits, plus
 * the two error behaviours: a missing request scope (plain unit test) warns and
 * skips, while any other failure propagates.
 */

const REVALIDATE_TAG_OUTSIDE_REQUEST =
  'Invariant: static generation store missing in revalidateTag("x")';

const h = vi.hoisted(() => ({
  mode: "ok" as "ok" | "no-request" | "boom",
  calls: [] as Array<{ tag: string; profile: unknown }>,
}));

vi.mock("next/cache", () => ({
  updateTag: () => undefined,
  revalidateTag: (tag: string, profile: unknown) => {
    if (h.mode === "no-request") throw new Error(REVALIDATE_TAG_OUTSIDE_REQUEST);
    if (h.mode === "boom") throw new Error("cache backend exploded");
    h.calls.push({ tag, profile });
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
const tags = () => h.calls.map((call) => call.tag);

describe("WP3b -> WP4 Route Handler cache seam", () => {
  beforeEach(() => {
    h.mode = "ok";
    h.calls.length = 0;
  });

  it("invalidates a published post with the exact tags and { expire: 0 }", async () => {
    await seam.invalidatePublishedPost(target);
    expect(tags()).toEqual(POST_TAGS);
    expect(h.calls.every((call) => JSON.stringify(call.profile) === '{"expire":0}')).toBe(true);
  });

  it("invalidates only the publication tags for a feed change", async () => {
    await seam.invalidatePublicationFeed(target);
    expect(tags()).toEqual(FEED_TAGS);
    expect(h.calls.every((call) => JSON.stringify(call.profile) === '{"expire":0}')).toBe(true);
  });

  it("a rename purges the retired and the new address", async () => {
    await seam.invalidatePostSlug(target, { ...target, postSlug: "New-Slug" });
    expect(tags()).toEqual([
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

  it("does not swallow an unexpected invalidation failure", async () => {
    h.mode = "boom";
    await expect(seam.invalidatePublishedPost(target)).rejects.toThrow("cache backend exploded");
  });
});
