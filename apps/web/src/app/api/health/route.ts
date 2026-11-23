import { getPool } from "@/kernel/db";

/**
 * Checks database health via SELECT 1 with a strict 5-second timeout (A11, B3).
 */
export async function checkDatabaseHealth(timeoutMs = 5000): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    return false;
  }
  try {
    const pool = getPool();
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Health check DB timeout")), timeoutMs);
    });

    const client = await Promise.race([pool.connect(), timeoutPromise]);
    try {
      await Promise.race([client.query("SELECT 1"), timeoutPromise]);
      return true;
    } finally {
      clearTimeout(timer);
      client.release();
    }
  } catch {
    return false;
  }
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
