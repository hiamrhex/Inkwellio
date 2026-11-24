/**
 * WP4 cache-invalidation seam (single hookup point).
 *
 * WP3b owns the write endpoints; WP4 owns public-page caching (`use cache` +
 * `updateTag()`). A publish, unpublish, delete, restore or rename changes what
 * a cached public page should show, so each mutating route calls the matching
 * function below *after* the service transaction commits.
 *
 * Until wp4-cache merges, these are deliberate no-ops: the seam exists so WP4
 * fills in `updateTag()`/`revalidateTag()` in exactly one file rather than
 * hunting through every route. Both take the post id; WP4 resolves the
 * publication id from the row when it wires the feed tag. Do not scatter cache
 * calls into the routes — add them here.
 */

/** The published post's own page changed. WP4: updateTag(`post:${postId}`). */
export async function invalidatePublishedPost(postId: string): Promise<void> {
  void postId;
}

/** The publication feed changed. WP4: resolve publication id, then updateTag(`publication:<id>:feed`). */
export async function invalidatePublicationFeed(postId: string): Promise<void> {
  void postId;
}

/** The post's public slug changed, so the old address must redirect. WP4: updateTag(`post:${postId}:slug`). */
export async function invalidatePostSlug(postId: string): Promise<void> {
  void postId;
}