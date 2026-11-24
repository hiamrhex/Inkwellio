import { getDraftForOwner, saveDraft } from "@/modules/posts";
import { readJsonObject, requireString, requireVersion } from "../../../_lib/body";
import { dbExecutor } from "../../../_lib/executor";
import { jsonError, requestIdFrom } from "../../../_lib/respond";
import { requireUser } from "../../../_lib/session";

/**
 * A post's draft (WP3b).
 *
 *   GET /api/posts/:id/draft  load the caller's draft (owner-only, 401/404)
 *   PUT /api/posts/:id/draft  save with compare-and-set on `expectedVersion`
 *
 * A stale `expectedVersion` is a 409 carrying the current draft (the service's
 * CONFLICT details), so the editor can reload rather than overwrite. The write
 * is owner-scoped: a stranger is 403, a missing session is 401.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const actor = await requireUser(request.headers);
    const { id } = await params;
    const draft = await getDraftForOwner(dbExecutor(), id, actor);
    return Response.json(draft, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const actor = await requireUser(request.headers);
    const { id } = await params;
    const body = await readJsonObject(request);
    const expectedVersion = requireVersion(body);
    const title = requireString(body, "title");
    const bodyMarkdown = requireString(body, "bodyMarkdown");

    const result = await saveDraft(dbExecutor(), {
      actor,
      postId: id,
      expectedVersion,
      title,
      bodyMarkdown,
    });
    return Response.json(result, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}