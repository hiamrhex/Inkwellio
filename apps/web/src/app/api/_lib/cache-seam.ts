/**
 * WP4 cache-invalidation seam (single hookup point).
 *
 * WP3b owns the write endpoints; WP4 owns public-page caching. A publish,
 * unpublish, delete, restore or rename changes what a cached public page
 * should show, so each mutating route calls the matching function below
 * *after* the service transaction commits.
 *
 * These are Route Handlers, and Next 16.4.5 refuses `updateTag()` there
 * (`workStore.page.endsWith('/route')`). WP4's `updateTag` invalidators stay
 * untouched for Server Actions; the Route Handler path calls the parallel
 * `revalidateTag(tag, { expire: 0 })` exports added to `modules/site`
 * (`revalidatePublishedPostFromRoute` / `revalidatePublicationFeedFromRoute`),
 * which purge exactly the same tags in the same order.
 *
 * The only handled failure is Next's "no request scope" invariant, which
 * plain Vitest unit tests hit because there is no static generation store to
 * invalidate. It is logged once through the kernel logger (never silent) and
 * skipped. Every other error propagates to `jsonError` as a 500, so a real
 * cache failure cannot masquerade as a successful write.
 */

import { logEvent } from "@/kernel/log";
import type { PostCacheTarget } from "@/modules/posts";
import {
  revalidatePublicationFeedFromRoute,
  revalidatePublishedPostFromRoute,
} from "@/modules/site";

const REVALIDATE_TAG_OUTSIDE_REQUEST =
  "Invariant: static generation store missing in revalidateTag(";

function isOutsideRequest(error: unknown): boolean {
  return error instanceof Error && error.message.includes(REVALIDATE_TAG_OUTSIDE_REQUEST);
}

let warnedOutsideRequest = false;

function run(invalidate: () => void): void {
  try {
    invalidate();
  } catch (error) {
    if (!isOutsideRequest(error)) throw error;
    if (!warnedOutsideRequest) {
      warnedOutsideRequest = true;
      logEvent("warn", "cache_invalidation_skipped", {
        reason: "no_next_request_scope",
      });
    }
  }
}

/** The published post's own page and its publication feed changed. */
export async function invalidatePublishedPost(target: PostCacheTarget): Promise<void> {
  run(() => {
    revalidatePublishedPostFromRoute({
      publicationSlug: target.publicationSlug,
      postSlug: target.postSlug,
      postId: target.postId,
    });
  });
}

/** Only the publication feed changed (restore returns the post to draft). */
export async function invalidatePublicationFeed(target: PostCacheTarget): Promise<void> {
  run(() => {
    revalidatePublicationFeedFromRoute(target.publicationSlug);
  });
}

/**
 * A slug rename retires one address and publishes another, so both the old
 * and the new post tag must be purged (plus the shared id tag and feed).
 * Two calls, exactly as two `invalidatePublishedPost` calls would run.
 */
export async function invalidatePostSlug(
  previous: PostCacheTarget,
  next: PostCacheTarget,
): Promise<void> {
  run(() => {
    revalidatePublishedPostFromRoute({
      publicationSlug: previous.publicationSlug,
      postSlug: previous.postSlug,
      postId: previous.postId,
    });
    revalidatePublishedPostFromRoute({
      publicationSlug: next.publicationSlug,
      postSlug: next.postSlug,
      postId: next.postId,
    });
  });
}

/**
 * Account erasure deletes every publication and published post owned by the
 * erased user, so purge every affected feed and post tag after commit.
 */
export async function invalidateErasedAccount(targets: {
  publicationSlugs: string[];
  publishedPosts: PostCacheTarget[];
}): Promise<void> {
  if (targets.publicationSlugs.length === 0 && targets.publishedPosts.length === 0) {
    return;
  }
  run(() => {
    for (const slug of targets.publicationSlugs) {
      revalidatePublicationFeedFromRoute(slug);
    }
    for (const post of targets.publishedPosts) {
      revalidatePublishedPostFromRoute({
        publicationSlug: post.publicationSlug,
        postSlug: post.postSlug,
        postId: post.postId,
      });
    }
  });
}
