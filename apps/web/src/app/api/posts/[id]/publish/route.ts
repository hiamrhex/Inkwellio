import { enforceWriteLimit } from "../../../_lib/write-limit";
import { getPostCacheTarget, publishPost } from "@/modules/posts";
import { readJsonObject } from "../../../_lib/body";
import { invalidatePublishedPost } from "../../../_lib/cache-seam";
import { dbExecutor } from "../../../_lib/executor";
import { requireExpectedVersion } from "../../../_lib/lifecycle";
import { jsonError, requestIdFrom } from "../../../_lib/respond";
import { requireUser } from "../../../_lib/session";

/**
 * Publish a post (WP3b).
 *
 *   POST /api/posts/:id/publish
 *
 * The idempotency key is the `x-request-id` header; a retry is answered from
 * the audit row. A stale `expectedVersion` is a 409 with the current draft.
 * The WP4 cache seam is called only after the service transaction commits.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const actor = await requireUser(request.headers);
    await enforceWriteLimit("write:publish", actor.userId, { structural: true });
    const { id } = await params;
    const body = await readJsonObject(request);
    const expectedVersion = requireExpectedVersion(body);

    const executor = dbExecutor();
    const target = await getPostCacheTarget(executor, id, actor);
    const result = await publishPost(executor, {
      actor,
      postId: id,
      expectedVersion,
      requestId,
    });
    if (target === undefined) {
      throw new Error("cache target missing after a committed publish");
    }
    await invalidatePublishedPost(target);
    return Response.json(result, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}