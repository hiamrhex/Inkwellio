import { sql } from "drizzle-orm";
import {
  notFound,
  pgCode,
  queryable,
  rows,
  toDate,
  validation,
  type Actor,
  type Executor,
  type Queryable,
} from "@/modules/publications";
import { isOwner } from "./service/ownership";

/**
 * Read paths for posts.
 *
 * Two invariants drive this file:
 *
 * 1. A feed row is a *published* post. `status = 'published'` is tied by
 *    `posts_published_pointer_check` to a non-null `published_revision_id`, and
 *    by `posts_published_at_check` to a non-null `published_at`, so the feed can
 *    always join the exact revision the pointer names. `deleted_at IS NULL` is
 *    redundant against the status CHECK and stated anyway: a feed query must not
 *    depend on a future author remembering that equivalence.
 * 2. A caller who may not see a post learns nothing about it. A draft read by a
 *    stranger, and a missing id, and a malformed id all throw the same
 *    argument-less `notFound()` — identical code and identical message.
 */

/** Raw columns with the `posts`/`publications` join, in Postgres spelling. */
type PostRow = {
  id: string;
  slug: string;
  status: "draft" | "published" | "deleted";
  published_revision_id: string | null;
  published_at: unknown;
  deleted_at: unknown;
  owner_id: string;
};

/** What a read returns. Deliberately metadata only: revision content is a
 * separate fetch, so a feed never pulls 100 KB bodies it will not render. */
export type Post = {
  readonly id: string;
  readonly slug: string;
  readonly status: "draft" | "published" | "deleted";
  readonly publishedRevisionId: string | null;
  readonly publishedAt: Date | null;
  readonly deletedAt: Date | null;
};

/** Keyset cursor: the `(published_at, id)` tuple of the last row on the page. */
export type FeedCursor = {
  readonly publishedAt: Date;
  readonly postId: string;
};

export type FeedItem = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly publishedAt: Date;
};

export type FeedPage = {
  readonly posts: readonly FeedItem[];
  readonly nextCursor: FeedCursor | null;
};

export const FEED_PAGE_SIZE_DEFAULT = 20;
export const FEED_PAGE_SIZE_MAX = 50;

/** Postgres uuid text form. A malformed id must be NOT_FOUND, not a 22P02
 * driver error that reaches the HTTP boundary as a 500 and leaks the column
 * type. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * One page of the published feed for a publication, newest first.
 *
 * `(published_at, id)` is both the ORDER BY and the cursor comparison, so a
 * page boundary can never skip or repeat a row even when many posts share a
 * timestamp. `posts_publication_feed_idx` is the matching partial index;
 * `posts_feed_idx` is the same ordering across all publications.
 *
 * Exhaustion: a full page returns a cursor; a short page (including an empty
 * one) returns `null`. A caller that happens to fill the final page therefore
 * makes one more request and receives zero rows.
 */
export async function fetchPublishedPage(
  executor: Executor,
  publicationId: string,
  cursor?: FeedCursor,
  pageSize: number = FEED_PAGE_SIZE_DEFAULT,
): Promise<FeedPage> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > FEED_PAGE_SIZE_MAX) {
    throw validation(`pageSize must be an integer between 1 and ${FEED_PAGE_SIZE_MAX}`);
  }
  if (cursor !== undefined) {
    if (!(cursor.publishedAt instanceof Date) || Number.isNaN(cursor.publishedAt.getTime())) {
      throw validation("cursor.publishedAt must be a valid Date");
    }
    if (!isUuid(cursor.postId)) throw validation("cursor.postId must be a UUID");
  }

  // A malformed publication id cannot name a feed. An empty page says that
  // without turning a user-supplied path segment into a 500.
  if (!isUuid(publicationId)) return { posts: [], nextCursor: null };

  const q: Queryable = queryable(executor);
  const after =
    cursor === undefined
      ? sql``
      : sql`AND (p.published_at, p.id) < (${cursor.publishedAt}, ${cursor.postId})`;

  let found: Array<{
    id: string;
    slug: string;
    title: string;
    published_at: unknown;
  }>;
  try {
    found = await rows<{
      id: string;
      slug: string;
      title: string;
      published_at: unknown;
    }>(
      q,
      sql`
        SELECT p.id, p.slug, r.title, p.published_at
          FROM posts p
          JOIN post_revisions r
            ON r.id = p.published_revision_id
           AND r.post_id = p.id
         WHERE p.publication_id = ${publicationId}
           AND p.status = 'published'
           AND p.deleted_at IS NULL
           AND p.published_at IS NOT NULL
           ${after}
         ORDER BY p.published_at DESC, p.id DESC
         LIMIT ${pageSize}
      `,
    );
  } catch (error) {
    // The publication id is validated above, so 22P02 here can only come from
    // the cursor; treat it as an empty page rather than a 500.
    if (pgCode(error) === "22P02") return { posts: [], nextCursor: null };
    throw error;
  }

  const posts: FeedItem[] = found.map((row) => {
    const publishedAt = toDate(row.published_at);
    if (publishedAt === null) {
      // `posts_published_at_check` guarantees this cannot happen for a
      // published row; failing loudly beats emitting a null cursor.
      throw new Error("A published feed row has no published_at");
    }
    return { id: row.id, slug: row.slug, title: row.title, publishedAt };
  });

  const last = posts.at(-1);
  const nextCursor: FeedCursor | null =
    last === undefined || posts.length < pageSize
      ? null
      : { publishedAt: last.publishedAt, postId: last.id };

  return { posts, nextCursor };
}

/**
 * Read one post, with the full visibility matrix in one place.
 *
 * Allowed:
 *  1. owner, `draft`            -> returns the post
 *  2. owner, `published`        -> returns the post
 *  3. signed-in stranger, `published` -> returns the post
 *  4. anonymous, `published`    -> returns the post
 * Denied with the same NOT_FOUND as a missing row:
 *  5. stranger or anonymous, `draft` or `deleted`
 *     missing uuid
 *     malformed uuid
 *
 * The decision reads `posts.status` and the row's real owner. It does not
 * count revisions: a draft that has been explicitly saved has revision rows,
 * and treating "has a revision" as "is published" would expose it.
 */
export async function getPostById(
  executor: Executor,
  postId: string,
  actor: Actor,
): Promise<Post> {
  if (!isUuid(postId)) throw notFound();

  const q: Queryable = queryable(executor);

  let found: PostRow[];
  try {
    found = await rows<PostRow>(
      q,
      sql`
        SELECT p.id,
               p.slug,
               p.status,
               p.published_revision_id,
               p.published_at,
               p.deleted_at,
               pub.owner_id
          FROM posts p
          JOIN publications pub ON pub.id = p.publication_id
         WHERE p.id = ${postId}
      `,
    );
  } catch (error) {
    if (pgCode(error) === "22P02") throw notFound();
    throw error;
  }

  const row = found[0];
  if (row === undefined) throw notFound();

  const isPubliclyVisible =
    row.status === "published" && row.deleted_at === null && row.published_at !== null;

  if (!isOwner(actor, row.owner_id) && !isPubliclyVisible) throw notFound();

  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    publishedRevisionId: row.published_revision_id,
    publishedAt: toDate(row.published_at),
    deletedAt: toDate(row.deleted_at),
  };
}
