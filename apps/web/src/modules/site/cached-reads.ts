import { cacheLife, cacheTag } from "next/cache";
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
