import { getOwnedPublication } from "@/modules/publications";
import { dbExecutor } from "../../_lib/executor";
import { jsonError, requestIdFrom } from "../../_lib/respond";
import { requireUser } from "../../_lib/session";

/**
 * One publication, owner-scoped (WP3b).
 *
 *   GET /api/publications/:id  the caller's own publication, or 404
 *
 * A missing id, a malformed id, and a publication owned by someone else are the
 * same 404: the id cannot be probed. A missing session is a 401 first.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const actor = await requireUser(request.headers);
    const { id } = await params;
    const publication = await getOwnedPublication(dbExecutor(), id, actor);
    return Response.json(publication, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}