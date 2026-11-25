import { ensurePublication, listPublicationsForOwner } from "@/modules/publications";
import { requireString, optionalString, readJsonObject } from "../_lib/body";
import { dbExecutor } from "../_lib/executor";
import { jsonError, requestIdFrom } from "../_lib/respond";
import { requireUser } from "../_lib/session";

/**
 * Publications collection (WP3b).
 *
 *   POST /api/publications  create (or return) the caller's one publication
 *   GET  /api/publications  list the caller's publications (0 or 1 by ADR-006)
 *
 * Both are owner-scoped and fail closed: `requireUser` turns a missing session
 * into a 401 before any service call. A service `ServiceError` is mapped to its
 * HTTP status by `jsonError`; nothing internal reaches the body.
 */

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const actor = await requireUser(request.headers);
    const body = await readJsonObject(request);
    const name = requireString(body, "name");
    const slug = optionalString(body, "slug");

    const publication = await ensurePublication(dbExecutor(), { actor, name, slug });
    return Response.json(publication, {
      status: publication.created ? 201 : 200,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const actor = await requireUser(request.headers);
    const publications = await listPublicationsForOwner(dbExecutor(), actor);
    return Response.json(
      { publications },
      { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}