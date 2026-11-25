import { newRequestId } from "@/kernel/request-id";
import type { FeedCursor } from "@/modules/posts";
import { parseSlug, validation } from "@/modules/publications";
import {
  mapPublicReadError,
  parseSearchPageSize,
  parseSearchQuery,
  searchPublishedPosts,
  withPublicDbTimeout,
} from "@/modules/search";
import { validateFeedPagination } from "@/modules/topics";

function parseLimitParam(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") {
    return undefined;
  }
  const parsed = Number(raw);
  return parseSearchPageSize(parsed);
}

function parseCursorParams(
  after: string | null,
  afterId: string | null,
): FeedCursor | undefined {
  if (after === null && afterId === null) {
    return undefined;
  }
  if (!after || !afterId) {
    throw validation("Both after and afterId cursor parameters are required");
  }
  const publishedAt = new Date(after);
  const cursor: FeedCursor = { publishedAt, postId: afterId };
  validateFeedPagination(cursor);
  return cursor;
}

/**
 * Bounded published-only search endpoint (`GET /api/search`).
 *
 * Validates `q` (1..100 chars), `limit` (1..50), optional `topic`, and keyset cursor
 * before touching the database so bad input never wakes Postgres compute.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = newRequestId();
  try {
    const url = new URL(request.url);
    const query = parseSearchQuery(url.searchParams.get("q") ?? "");
    const pageSize = parseLimitParam(url.searchParams.get("limit"));
    const cursor = parseCursorParams(
      url.searchParams.get("after"),
      url.searchParams.get("afterId"),
    );

    const rawTopic = url.searchParams.get("topic");
    let topicSlug: string | undefined;
    if (rawTopic !== null && rawTopic.trim() !== "") {
      try {
        topicSlug = parseSlug(rawTopic.trim().toLowerCase());
      } catch {
        throw validation("Invalid topic slug filter");
      }
    }

    const results = await withPublicDbTimeout((executor) =>
      searchPublishedPosts(executor, { query, topicSlug, cursor, pageSize }),
    );

    return Response.json(results, {
      status: 200,
      headers: {
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
        "x-content-type-options": "nosniff",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    const publicError = mapPublicReadError(error, requestId);
    return Response.json(
      { error: publicError },
      {
        status: publicError.status,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "x-request-id": requestId,
        },
      },
    );
  }
}
