import { publishPost } from "@/modules/posts";
import { readJsonObject } from "../../../_lib/body";
import { invalidatePublicationFeed, invalidatePublishedPost } from "../../../_lib/cache-seam";
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
    const { id } = await params;
    const body = await readJsonObject(request);
    const expectedVersion = requireExpectedVersion(body);

    const result = await publishPost(dbExecutor(), {
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