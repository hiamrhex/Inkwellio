import { getPostById } from "@/modules/posts";
import { dbExecutor } from "../../_lib/executor";
import { jsonError, requestIdFrom } from "../../_lib/respond";
import { resolveActor } from "../../_lib/session";

/**
 * One post, with WP3a's full visibility matrix (WP3b).
 *
 *   GET /api/posts/:id  published -> anyone; draft/deleted -> owner only
 *
 * This read is public: `resolveActor` returns `null` for an anonymous caller and
 * the service decides visibility. A draft read by a stranger is the same 404 as
 * a missing post, so nothing is leaked. No 401 here — reading is allowed.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const actor = await resolveActor(request.headers);
    const { id } = await params;
    const post = await getPostById(dbExecutor(), id, actor);
    return Response.json(post, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}