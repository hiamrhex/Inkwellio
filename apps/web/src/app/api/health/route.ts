import { getPool, type HealthProbeClient, type HealthProbePool } from "@/kernel/db";

/**
 * Checks database health via SELECT 1 with a strict 5-second timeout (A11, B3).
 *
 * The leak this guards: if `pool.connect()` resolves and the `SELECT 1` then
 * times out, a plain `Promise.race` never runs the `finally`, so that pooled
 * client is never released. Five leaked clients exhaust the pool (`max: 5`)
 * and the whole application hangs on its next query — the health check that is
 * meant to detect an unhealthy database causes the outage instead.
 *
 * `pool` is injectable so the leak can be proven in a test without a socket.
 */
export async function checkDatabaseHealth(
  timeoutMs = 5000,
  pool?: HealthProbePool,
): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  let client: HealthProbeClient;
  try {
    // Resolved lazily: a default of `getPool()` would throw while building the
    // arguments, before the DATABASE_URL guard above could answer 503.
    client = await Promise.race([
      (pool ?? getPool()).connect(),
      rejectAfter(timeoutMs, "Health check DB timeout"),
    ]);
  } catch {
    // Never connected, or gave up: nothing was acquired, nothing to release.
    return false;
  }

  try {
    await Promise.race([
      client.query("SELECT 1"),
      rejectAfter(timeoutMs, "Health check DB timeout"),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    // Runs on both outcomes, so a slow query cannot strand a pooled client.
    client.release();
  }
}

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Health check endpoint matching A11:
 * `/api/health`, a `SELECT 1` with a 5 second limit, reported only
 * through status 200 or 503, minimal body.
 */
export async function GET(): Promise<Response> {
  const healthy = await checkDatabaseHealth(5000);
  const status = healthy ? 200 : 503;
  const body = healthy ? { status: "ok" } : { status: "unavailable" };

  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}