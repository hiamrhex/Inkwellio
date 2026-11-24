import { newRequestId } from "@/kernel/request-id";
import { mapPublicReadError, withPublicDbTimeout } from "@/modules/search";
import { listTopics } from "@/modules/topics";

/**
 * Public curated topics listing endpoint (`GET /api/topics`).
 */
export async function GET(): Promise<Response> {
  const requestId = newRequestId();
  try {
    const topics = await withPublicDbTimeout((executor) => listTopics(executor));
    return Response.json(
      { topics },
      {
        status: 200,
        headers: {
          "cache-control": "public, max-age=60, stale-while-revalidate=300",
          "x-content-type-options": "nosniff",
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    const publicError = mapPublicReadError(error, requestId);
    return Response.json(
      { error: publicError },
      {
        status: publicError.status,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "x-request-id": requestId,
        },
      },
    );
  }
}
