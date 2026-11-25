import { deletePost, getPostCacheTarget } from "@/modules/posts";
import { readJsonObject } from "../../../_lib/body";
import { invalidatePublishedPost } from "../../../_lib/cache-seam";
import { dbExecutor } from "../../../_lib/executor";
import { requireExpectedVersion } from "../../../_lib/lifecycle";
import { jsonError, requestIdFrom } from "../../../_lib/respond";
import { requireUser } from "../../../_lib/session";

/**
 * Soft-delete a post (WP3b): `draft|published` -> `deleted`.
 *
 *   POST /api/posts/:id/delete
 *
 * A stale version is a 409; a stranger is 403; a missing session is 401. The
 * WP4 cache seam runs after the service transaction commits.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const actor = await requireUser(request.headers);
    const { id } = await params;
    const body = await readJsonObject(request);
    const expectedVersion = requireExpectedVersion(body);

    const executor = dbExecutor();
    const target = await getPostCacheTarget(executor, id, actor);
    const result = await deletePost(executor, {
      actor,
      postId: id,
      expectedVersion,
      requestId,
    });
    if (target === undefined) {
      throw new Error("cache target missing after a committed delete");
    }
    await invalidatePublishedPost(target);
    return Response.json(result, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}