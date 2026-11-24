import { sql } from "drizzle-orm";
import {
  FEED_PAGE_SIZE_DEFAULT,
  FEED_PAGE_SIZE_MAX,
  type FeedCursor,
} from "@/modules/posts";
import {
  parseSlug,
  pgCode,
  queryable,
  rows,
  toNumber,
  validation,
  type Executor,
  type Queryable,
} from "@/modules/publications";
import type { TopicRecord } from "./seed";

export const TOPIC_PAGE_SIZE_DEFAULT = FEED_PAGE_SIZE_DEFAULT;
export const TOPIC_PAGE_SIZE_MAX = FEED_PAGE_SIZE_MAX;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TopicSummary = TopicRecord & {
  readonly publishedCount: number;
};

export type TopicPostItem = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly publishedAt: Date;
  readonly publicationSlug: string;
  readonly publicationName: string;
};

export type TopicFeedPage = {
  readonly topic: TopicRecord;
  readonly posts: readonly TopicPostItem[];
  readonly nextCursor: FeedCursor | null;
};

/** Normalizes driver `timestamptz` Date/string representations. */
export function parseTimestamp(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  throw new Error("Expected a timestamp column to parse as a Date");
}

/** Validates keyset pagination cursor and page-size bounds for feed/search reads. */
export function validateFeedPagination(
  cursor?: FeedCursor,
  pageSize: number = TOPIC_PAGE_SIZE_DEFAULT,
): number {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > TOPIC_PAGE_SIZE_MAX) {
    throw validation(`pageSize must be an integer between 1 and ${TOPIC_PAGE_SIZE_MAX}`);
  }
  if (cursor !== undefined) {
    if (!(cursor.publishedAt instanceof Date) || Number.isNaN(cursor.publishedAt.getTime())) {
      throw validation("cursor.publishedAt must be a valid Date");
    }
    if (!UUID_PATTERN.test(cursor.postId)) {
      throw validation("cursor.postId must be a UUID");
    }
  }
  return pageSize;
}

/** Validates and lowercases a topic slug; returns undefined for malformed input. */
export function normalizeTopicSlug(rawSlug: string): string | undefined {
  try {
    return parseSlug(rawSlug.trim().toLowerCase());
  } catch {
    return undefined;
  }
}

/** Lists all curated topics with counts of published, non-deleted posts only. */
export async function listTopics(executor: Executor): Promise<TopicSummary[]> {
  const q: Queryable = queryable(executor);
  const found = await rows<{
    id: string;
    slug: string;
    name: string;
    published_count: unknown;
  }>(
    q,
    sql`
      SELECT t.id,
             t.slug,
             t.name,
             COUNT(p.id)::bigint AS published_count
        FROM topics t
        LEFT JOIN post_topics pt
          ON pt.topic_id = t.id
        LEFT JOIN posts p
          ON p.id = pt.post_id
         AND p.status = 'published'
         AND p.deleted_at IS NULL
         AND p.published_at IS NOT NULL
       GROUP BY t.id, t.slug, t.name
       ORDER BY t.name ASC, t.slug ASC
    `,
  );

  return found.map((entry) => ({
    id: entry.id,
    slug: entry.slug,
    name: entry.name,
    publishedCount: toNumber(entry.published_count),
  }));
}

/** Looks up one curated topic by slug; returns undefined if invalid or missing. */
export async function getTopicBySlug(
  executor: Executor,
  rawSlug: string,
): Promise<TopicRecord | undefined> {
  const slug = normalizeTopicSlug(rawSlug);
  if (slug === undefined) {
    return undefined;
  }

  const q: Queryable = queryable(executor);
  const found = await rows<TopicRecord>(
    q,
    sql`SELECT id, slug, name FROM topics WHERE slug = ${slug} LIMIT 1`,
  );
  return found[0];
}

/**
 * Fetches one keyset-paginated page of published posts assigned to a topic.
 *
 * Strictly filters to `status = 'published' AND deleted_at IS NULL AND published_at IS NOT NULL`
 * joined against `published_revision_id` so drafts and deleted posts are never returned.
 */
export async function fetchTopicPublishedPage(
  executor: Executor,
  rawSlug: string,
  cursor?: FeedCursor,
  pageSize: number = TOPIC_PAGE_SIZE_DEFAULT,
): Promise<TopicFeedPage | undefined> {
  const limit = validateFeedPagination(cursor, pageSize);
  const topic = await getTopicBySlug(executor, rawSlug);
  if (topic === undefined) {
    return undefined;
  }

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
    publication_slug: string;
    publication_name: string;
  }>;

  try {
    found = await rows(
      q,
      sql`
        SELECT p.id,
               p.slug,
               r.title,
               p.published_at,
               pub.slug AS publication_slug,
               pub.name AS publication_name
          FROM post_topics pt
          JOIN posts p
            ON p.id = pt.post_id
          JOIN publications pub
            ON pub.id = p.publication_id
          JOIN post_revisions r
            ON r.id = p.published_revision_id
           AND r.post_id = p.id
         WHERE pt.topic_id = ${topic.id}
           AND p.status = 'published'
           AND p.deleted_at IS NULL
           AND p.published_at IS NOT NULL
           ${after}
         ORDER BY p.published_at DESC, p.id DESC
         LIMIT ${limit}
      `,
    );
  } catch (error) {
    if (pgCode(error) === "22P02") {
      return { topic, posts: [], nextCursor: null };
    }
    throw error;
  }

  const posts: TopicPostItem[] = found.map((item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    publishedAt: parseTimestamp(item.published_at),
    publicationSlug: item.publication_slug,
    publicationName: item.publication_name,
  }));

  const last = posts.at(-1);
  const nextCursor: FeedCursor | null =
    last === undefined || posts.length < limit
      ? null
      : { publishedAt: last.publishedAt, postId: last.id };

  return { topic, posts, nextCursor };
}
