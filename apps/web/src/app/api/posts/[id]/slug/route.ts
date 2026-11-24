import { renamePost } from "@/modules/posts";
import { readJsonObject, requireString } from "../../../_lib/body";
import { invalidatePostSlug } from "../../../_lib/cache-seam";
import { dbExecutor } from "../../../_lib/executor";
import { jsonError, requestIdFrom } from "../../../_lib/respond";
import { requireUser } from "../../../_lib/session";

/**
 * Rename a post's public slug (WP3b).
 *
 *   POST /api/posts/:id/slug
 *
 * WP3a writes the retired address to history before moving the pointer, so an
 * old link redirects instead of 404s. A stranger is 403; a missing session is
 * 401; a taken address is a 409. The WP4 slug seam runs after the transaction.
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
    const slug = requireString(body, "slug");

    const result = await renamePost(dbExecutor(), { actor, postId: id, slug });
    await invalidatePostSlug(id);
    return Response.json(result, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}