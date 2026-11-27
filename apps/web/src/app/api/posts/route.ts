import { enforceWriteLimit } from "../_lib/write-limit";
import { createPost } from "@/modules/posts";
import { optionalString, readJsonObject, requireString } from "../_lib/body";
import { dbExecutor } from "../_lib/executor";
import { jsonError, requestIdFrom } from "../_lib/respond";
import { requireUser } from "../_lib/session";

/**
 * Posts collection (WP3b).
 *
 *   POST /api/posts  create a draft post in a publication the caller owns
 *
 * Owner-scoped and fail-closed: a missing session is a 401 before any service
 * call, and `createPost` refuses a stranger with FORBIDDEN (403) on the row.
 */

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const actor = await requireUser(request.headers);
    await enforceWriteLimit("write:create_post", actor.userId, { structural: true });
    const body = await readJsonObject(request);
    const publicationId = requireString(body, "publicationId");
    const slug = optionalString(body, "slug");

    const post = await createPost(dbExecutor(), { actor, publicationId, slug });
    return Response.json(post, {
      status: 201,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}