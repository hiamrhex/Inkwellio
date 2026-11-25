import { sql } from "drizzle-orm";
import { getDb } from "@/kernel/db";
import { AppError, ValidationError, toPublicError, type PublicError } from "@/kernel/errors";
import { type FeedCursor } from "@/modules/posts";
import {
  isServiceError,
  parseSlug,
  pgCode,
  queryable,
  rows,
  validation,
  type Executor,
  type Queryable,
} from "@/modules/publications";
import { parseTimestamp, validateFeedPagination } from "@/modules/topics";
import {
  escapeLikePattern,
  parseSearchPageSize,
  parseSearchQuery,
} from "./validation";

export const SEARCH_READ_TIMEOUT_MS = 15_000;

export type SearchPostInput = {
  readonly query: string;
  readonly topicSlug?: string;
  readonly cursor?: FeedCursor;
  readonly pageSize?: number;
};

export type SearchResultItem = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly publishedAt: Date;
  readonly publicationSlug: string;
  readonly publicationName: string;
};

export type SearchPage = {
  readonly query: string;
  readonly items: readonly SearchResultItem[];
  readonly nextCursor: FeedCursor | null;
};

function buildExcerpt(markdown: string, maxLength = 180): string {
  const collapsed = markdown.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength - 3).trimEnd()}...`;
}

/**
 * Published-only, keyset-paginated, bounded search over `posts` and `post_revisions`.
 *
 * Security & visibility invariants:
 * - Zero string-concatenated SQL: uses bound parameters via Drizzle `sql` + `ESCAPE '\'`.
 * - Enforces `p.status = 'published' AND p.deleted_at IS NULL AND p.published_at IS NOT NULL`.
 * - Joins only `published_revision_id`, never reading `draft_state` or unpublished revisions.
 */
export async function searchPublishedPosts(
  executor: Executor,
  input: SearchPostInput,
): Promise<SearchPage> {
  const query = parseSearchQuery(input.query);
  const limit = parseSearchPageSize(input.pageSize);
  validateFeedPagination(input.cursor, limit);

  let normalizedTopic: string | undefined;
  if (input.topicSlug !== undefined && input.topicSlug.trim() !== "") {
    try {
      normalizedTopic = parseSlug(input.topicSlug.trim().toLowerCase());
    } catch {
      throw validation("Invalid topic slug filter");
    }
  }

  const pattern = `%${escapeLikePattern(query)}%`;
  const q: Queryable = queryable(executor);

  const topicClause =
    normalizedTopic === undefined
      ? sql``
      : sql`AND EXISTS (
              SELECT 1
                FROM post_topics pt
                JOIN topics t ON t.id = pt.topic_id
               WHERE pt.post_id = p.id
                 AND t.slug = ${normalizedTopic}
            )`;

  const cursorClause =
    input.cursor === undefined
      ? sql``
      : sql`AND (p.published_at, p.id) < (${input.cursor.publishedAt}, ${input.cursor.postId})`;

  let found: Array<{
    id: string;
    slug: string;
    title: string;
    body_markdown: string;
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
               r.body_markdown,
               p.published_at,
               pub.slug AS publication_slug,
               pub.name AS publication_name
          FROM posts p
          JOIN publications pub
            ON pub.id = p.publication_id
          JOIN post_revisions r
            ON r.id = p.published_revision_id
           AND r.post_id = p.id
         WHERE p.status = 'published'
           AND p.deleted_at IS NULL
           AND p.published_at IS NOT NULL
           AND (
             r.title ILIKE ${pattern} ESCAPE '\'
             OR r.body_markdown ILIKE ${pattern} ESCAPE '\'
           )
           ${topicClause}
           ${cursorClause}
         ORDER BY p.published_at DESC, p.id DESC
         LIMIT ${limit + 1}
      `,
    );
  } catch (error) {
    if (pgCode(error) === "22P02") {
      return { query, items: [], nextCursor: null };
    }
    throw error;
  }

  const hasMore = found.length > limit;
  const pageRows = hasMore ? found.slice(0, limit) : found;

  const items: SearchResultItem[] = pageRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: buildExcerpt(row.body_markdown),
    publishedAt: parseTimestamp(row.published_at),
    publicationSlug: row.publication_slug,
    publicationName: row.publication_name,
  }));

  const last = items.at(-1);
  const nextCursor: FeedCursor | null =
    !hasMore || last === undefined
      ? null
      : { publishedAt: last.publishedAt, postId: last.id };

  return { query, items, nextCursor };
}

/**
 * Executes a public read callback with a bounded database timeout (A9),
 * ensuring missing `DATABASE_URL` or slow DB failures resolve safely.
 */
export async function withPublicDbTimeout<T>(
  operation: (executor: Executor) => Promise<T>,
  timeoutMs = SEARCH_READ_TIMEOUT_MS,
): Promise<T> {
  if (!process.env.DATABASE_URL) {
    throw new AppError("Temporarily unavailable", "UNAVAILABLE");
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new AppError("Temporarily unavailable", "UNAVAILABLE")),
      timeoutMs,
    );
  });

  try {
    const executor: Executor = { kind: "db", db: getDb() };
    return await Promise.race([operation(executor), timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/** Maps validation and database/timeout failures to clean HTTP PublicError shapes. */
export function mapPublicReadError(error: unknown, requestId: string): PublicError {
  if (isServiceError(error) && error.code === "VALIDATION") {
    return toPublicError(new ValidationError(error.message), requestId);
  }
  if (error instanceof AppError) {
    return toPublicError(error, requestId);
  }
  return toPublicError(
    Object.assign(new Error("Database unavailable"), { code: "57014" }),
    requestId,
  );
}
