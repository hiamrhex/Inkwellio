import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import {
  postByIdTag,
  postTag,
  publicationFeedTag,
  publicationTag,
} from "./cache-tags";
import {
  loadPublicPost,
  loadPublicPublicationFeed,
  type PublicPostResult,
  type PublicPublicationFeedResult,
} from "./public-reads";

/**
 * Cached public publication feed (A1, A9).
 *
 * Uses `cacheLife("feed")` (revalidate 60 s, expire 5 min) so public readers
 * continue serving cached feeds if Neon compute suspends.
 */
export async function getCachedPublicationFeed(
  handle: string,
): Promise<PublicPublicationFeedResult> {
  "use cache";
  cacheLife("feed");
  const normalized = handle.trim().toLowerCase();
  cacheTag(publicationTag(normalized), publicationFeedTag(normalized));
  return loadPublicPublicationFeed(handle);
}

/**
 * Cached public published post (A1, A6, A9).
 *
 * Uses `cacheLife("post")` (revalidate 60 s, expire 1 h) and tags both the
 * publication and canonical post coordinates for `updateTag()` invalidation.
 */
export async function getCachedPost(
  handle: string,
  slug: string,
): Promise<PublicPostResult> {
  "use cache";
  cacheLife("post");
  const normHandle = handle.trim().toLowerCase();
  const normSlug = slug.trim().toLowerCase();
  cacheTag(publicationTag(normHandle), postTag(normHandle, normSlug));

  const result = await loadPublicPost(handle, slug);
  if (result.kind === "ok") {
    cacheTag(postByIdTag(result.post.id));
  }
  return result;
}

/**
 * Route Handler invalidation for a publication feed (WP3b write routes).
 *
 * Next 16.4.5's bundled docs (`04-functions/revalidateTag.md`) state that
 * `revalidateTag` "can be called in Server Functions and Route Handlers" and
 * that `updateTag` is Server-Action-only. They also give the exact signature
 * `revalidateTag(tag: string, profile: string | { expire?: number }): void` —
 * the second argument is required, the single-argument form is deprecated —
 * and direct callers outside a Server Action to `{ expire: 0 }` for immediate
 * expiration (the `updateTag` equivalent).
 *
 * These functions mirror `cache-tags.ts`'s `updateTag` invalidators tag for
 * tag, so the Server Action path and the Route Handler path cannot drift.
 */
export function revalidatePublicationFeedFromRoute(publicationSlug: string): void {
  revalidateTag(publicationTag(publicationSlug), { expire: 0 });
  revalidateTag(publicationFeedTag(publicationSlug), { expire: 0 });
}

/** Route Handler invalidation for a post and its parent publication feed. */
export function revalidatePublishedPostFromRoute(input: {
  publicationSlug: string;
  postSlug: string;
  postId?: string;
}): void {
  revalidateTag(publicationTag(input.publicationSlug), { expire: 0 });
  revalidateTag(publicationFeedTag(input.publicationSlug), { expire: 0 });
  revalidateTag(postTag(input.publicationSlug, input.postSlug), { expire: 0 });
  if (input.postId) {
    revalidateTag(postByIdTag(input.postId), { expire: 0 });
  }
}
