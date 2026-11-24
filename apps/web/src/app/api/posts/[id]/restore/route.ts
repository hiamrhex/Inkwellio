import { restorePost } from "@/modules/posts";
import { readJsonObject } from "../../../_lib/body";
import { invalidatePublicationFeed, invalidatePublishedPost } from "../../../_lib/cache-seam";
import { dbExecutor } from "../../../_lib/executor";
import { requireExpectedVersion } from "../../../_lib/lifecycle";
import { jsonError, requestIdFrom } from "../../../_lib/respond";
import { requireUser } from "../../../_lib/session";

/**
 * Restore a deleted post (WP3b): `deleted` -> `draft`, the only way back.
 *
 *   POST /api/posts/:id/restore
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

    const result = await restorePost(dbExecutor(), {
      actor,
      postId: id,
      expectedVersion,
      requestId,
    });
    await invalidatePublishedPost(id);
    await invalidatePublicationFeed(id);
    return Response.json(result, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}