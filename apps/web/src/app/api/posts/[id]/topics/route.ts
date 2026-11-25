import { getPostCacheTarget } from "@/modules/posts";
import { setPostTopics } from "@/modules/topics";
import { readJsonObject, requireStringArray } from "../../../_lib/body";
import { invalidatePublishedPost } from "../../../_lib/cache-seam";
import { dbExecutor } from "../../../_lib/executor";
import { jsonError, requestIdFrom } from "../../../_lib/respond";
import { requireUser } from "../../../_lib/session";

/**
 * Replace a post's curated topics (ADR-012, WP3b).
 *
 *   PUT /api/posts/:id/topics
 *
 * Body: `{ "topicSlugs": ["tactics", "analytics"] }` — at most three curated
 * slugs, duplicates collapsed. The set is replaced, never merged. A stranger
 * is 403; a missing or deleted post is 404; an unknown slug, a non-array body
 * or more than three topics is 400. A published post's cached page and feed
 * are purged after the transaction commits.
 */

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const actor = await requireUser(request.headers);
    const { id } = await params;
    const body = await readJsonObject(request);
    const topicSlugs = requireStringArray(body, "topicSlugs");

    const executor = dbExecutor();
    const target = await getPostCacheTarget(executor, id, actor);
    const result = await setPostTopics(executor, { actor, postId: id, topicSlugs });

    if (result.status === "published") {
      if (target === undefined) {
        throw new Error("cache target missing after a committed topic assignment");
      }
      await invalidatePublishedPost(target);
    }

    return Response.json(result, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
