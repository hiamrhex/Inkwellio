/**
 * WP4 cache-invalidation seam (single hookup point).
 *
 * WP3b owns the write endpoints; WP4 owns public-page caching (`use cache` +
 * `updateTag()`). A publish, unpublish, delete, restore or rename changes what
 * a cached public page should show, so each mutating route calls the matching
 * function below *after* the service transaction commits.
 *
 * The routes are Route Handlers, and Next 16 refuses `updateTag()` there:
 *
 *   "updateTag can only be called from within a Server Action. To invalidate
 *    cache tags in Route Handlers or other contexts, use revalidateTag instead."
 *
 * (The guard is `workStore.page.endsWith('/route')` in
 * `next/dist/server/web/spec-extension/revalidate.js`.) So this seam still
 * calls WP4's real invalidators first — they stay the single source of truth
 * for which tags a change touches — and only on that exact error falls back to
 * `revalidateTag(tag, { expire: 0 })` with the same tags. `{ expire: 0 }` is
 * the documented Route Handler equivalent of `updateTag`'s immediate
 * expiration, not `"max"` (which would serve stale content).
 *
 * Two failures are handled, both loudly and by exact message:
 *
 * 1. `updateTag` outside a Server Action -> fall back to `revalidateTag`.
 * 2. `revalidateTag` outside a Next request scope (plain Vitest unit tests)
 *    -> warn once and return; there is no cache to invalidate.
 *
 * Every other error is rethrown. Nothing is swallowed silently.
 */

import { logEvent } from "@/kernel/log";
import type { PostCacheTarget } from "@/modules/posts";
import {
  invalidatePublicationFeed as invalidateSitePublicationFeed,
  invalidatePublishedPost as invalidateSitePublishedPost,
  postByIdTag,
  postTag,
  publicationFeedTag,
  publicationTag,
} from "@/modules/site";
import { revalidateTag } from "next/cache";

const UPDATE_TAG_OUTSIDE_ACTION =
  "updateTag can only be called from within a Server Action.";
const REVALIDATE_TAG_OUTSIDE_REQUEST =
  "Invariant: static generation store missing in revalidateTag(";

function isUpdateTagOutsideAction(error: unknown): boolean {
  return error instanceof Error && error.message.includes(UPDATE_TAG_OUTSIDE_ACTION);
}

function isRevalidateTagOutsideRequest(error: unknown): boolean {
  return error instanceof Error && error.message.includes(REVALIDATE_TAG_OUTSIDE_REQUEST);
}

/**
 * The tags WP4's `invalidatePublicationFeed` purges. Kept next to the call so
 * a change to WP4's tag vocabulary shows up in one place; the cache tests
 * assert this list equals what WP4's helper emits under a working `updateTag`.
 */
function feedTags(target: PostCacheTarget): string[] {
  return [publicationTag(target.publicationSlug), publicationFeedTag(target.publicationSlug)];
}

/** The tags WP4's `invalidatePublishedPost` purges, in its emission order. */
function postTags(target: PostCacheTarget): string[] {
  return [
    ...feedTags(target),
    postTag(target.publicationSlug, target.postSlug),
    postByIdTag(target.postId),
  ];
}

let warnedOutsideRequest = false;

function invalidate(tags: readonly string[], run: () => void): void {
  try {
    run();
    return;
  } catch (error) {
    if (!isUpdateTagOutsideAction(error)) throw error;
  }

  try {
    for (const tag of tags) revalidateTag(tag, { expire: 0 });
  } catch (error) {
    if (!isRevalidateTagOutsideRequest(error)) throw error;
    if (!warnedOutsideRequest) {
      warnedOutsideRequest = true;
      logEvent("warn", "cache_invalidation_skipped", {
        reason: "no_next_request_scope",
        tags: tags.length,
      });
    }
  }
}

/** The published post's own page and its publication feed changed. */
export async function invalidatePublishedPost(target: PostCacheTarget): Promise<void> {
  invalidate(postTags(target), () => {
    invalidateSitePublishedPost({
      publicationSlug: target.publicationSlug,
      postSlug: target.postSlug,
      postId: target.postId,
    });
  });
}

/** Only the publication feed changed (restore returns the post to draft). */
export async function invalidatePublicationFeed(target: PostCacheTarget): Promise<void> {
  invalidate(feedTags(target), () => {
    invalidateSitePublicationFeed(target.publicationSlug);
  });
}

/**
 * A slug rename retires one address and publishes another, so both the old
 * and the new post tag must be purged (plus the shared id tag and feed).
 */
export async function invalidatePostSlug(
  previous: PostCacheTarget,
  next: PostCacheTarget,
): Promise<void> {
  // Exactly the tags WP4's helper emits for each address, in the same order:
  // the union would diverge from the Server Action path, and duplicate tag
  // invalidations are harmless.
  const tags = [...postTags(previous), ...postTags(next)];
  invalidate(tags, () => {
    invalidateSitePublishedPost({
      publicationSlug: previous.publicationSlug,
      postSlug: previous.postSlug,
      postId: previous.postId,
    });
    invalidateSitePublishedPost({
      publicationSlug: next.publicationSlug,
      postSlug: next.postSlug,
      postId: next.postId,
    });
  });
}
