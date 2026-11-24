import { updateTag } from "next/cache";

/**
 * Explicit cache tag constructors (A6, A9).
 *
 * Prepared for WP3a publish/unpublish/rename and WP2 erasure Server Actions
 * to purge stale public responses via `updateTag()`.
 */
export function publicationTag(publicationSlug: string): string {
  return `publication:${publicationSlug.toLowerCase()}`;
}

export function publicationFeedTag(publicationSlug: string): string {
  return `publication-feed:${publicationSlug.toLowerCase()}`;
}

export function postTag(publicationSlug: string, postSlug: string): string {
  return `post:${publicationSlug.toLowerCase()}:${postSlug.toLowerCase()}`;
}

export function postByIdTag(postId: string): string {
  return `post-id:${postId}`;
}

/** Invalidate a publication's landing feed cache tag on publish, rename, or erasure. */
export function invalidatePublicationFeed(publicationSlug: string): void {
  updateTag(publicationTag(publicationSlug));
  updateTag(publicationFeedTag(publicationSlug));
}

/** Invalidate a published post and its parent publication feed cache tags. */
export function invalidatePublishedPost(input: {
  publicationSlug: string;
  postSlug: string;
  postId?: string;
}): void {
  updateTag(publicationTag(input.publicationSlug));
  updateTag(publicationFeedTag(input.publicationSlug));
  updateTag(postTag(input.publicationSlug, input.postSlug));
  if (input.postId) {
    updateTag(postByIdTag(input.postId));
  }
}
