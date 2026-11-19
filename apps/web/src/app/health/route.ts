import { newRequestId } from "@/kernel/request-id";

/**
 * Liveness, not readiness.
 *
 * It answers "is this process serving?" and touches no database on purpose: a
 * health check that queries Postgres turns a database blip into a failed deploy
 * and, on a serverless platform, into a restart loop. The real availability
 * signal is the A11 probe.
 *
 * The body is fixed. No version, no commit, no hostname, no dependency status —
 * a health endpoint is an unauthenticated endpoint.
 */
export function GET(): Response {
  return Response.json(
    { status: "ok" },
    {
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-request-id": newRequestId(),
      },
    },
  );
}
