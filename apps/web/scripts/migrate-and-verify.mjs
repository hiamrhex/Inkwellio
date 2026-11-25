#!/usr/bin/env node
/**
 * One-command, zero-secret migration + verification.
 *
 *   DATABASE_URL_UNPOOLED='postgresql://...' \
 *     pnpm --filter @inkwellio/web db:migrate:verify
 *
 * What it does, in order:
 *
 * 1. Reads `DATABASE_URL_UNPOOLED` and fails closed if it is missing.
 * 2. Refuses a `-pooler` host. Neon's pooled endpoint multiplexes sessions and
 *    cannot run DDL reliably (Layer 28); migrations use the direct endpoint.
 * 3. Runs `drizzle-kit migrate` as a child process with `DATABASE_URL` set to
 *    that direct URL. The URL is passed through the environment only and is
 *    never printed, logged, or included in an error message.
 * 4. Connects with `pg` and asserts every expected public table exists.
 * 5. Pings the health endpoint (default production) and prints the HTTP status
 *    and JSON `status`. Set `SKIP_HEALTH=1` to skip it, or `HEALTH_URL=` to
 *    point elsewhere.
 *
 * The script uses only dependencies the app already has: `pg`, `drizzle-kit`,
 * and Node built-ins.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const EXPECTED_TABLES = [
  "accounts",
  "audit_events",
  "draft_state",
  "post_revisions",
  "post_slug_history",
  "post_topics",
  "posts",
  "publication_slug_history",
  "publications",
  "rate_limit_counters",
  "rate_limits",
  "sessions",
  "topics",
  "users",
  "verifications",
];

const DEFAULT_HEALTH_URL = "https://inkwellio.vercel.app/api/health";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");

function fail(message) {
  console.error(`migrate-and-verify: ${message}`);
  process.exit(1);
}

function directUrl() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (url === undefined || url.trim() === "") {
    fail(
      "DATABASE_URL_UNPOOLED is not set. Provide the direct (non-pooled) connection string; this script never prints it.",
    );
  }
  if (url.includes("-pooler")) {
    fail(
      "DATABASE_URL_UNPOOLED contains '-pooler'. Migrations require the direct Neon endpoint, not the pooler (Layer 28).",
    );
  }
  return url;
}

/** Resolve drizzle-kit's CLI without assuming a shell or a global install. */
function drizzleKitCli() {
  const require = createRequire(import.meta.url);
  let dir = path.dirname(require.resolve("drizzle-kit"));
  for (let depth = 0; depth < 5; depth += 1) {
    const packagePath = path.join(dir, "package.json");
    if (existsSync(packagePath)) {
      const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
      if (pkg.name === "drizzle-kit") {
        const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["drizzle-kit"];
        if (typeof bin !== "string") {
          fail("could not resolve the drizzle-kit CLI entry point");
        }
        return path.resolve(dir, bin);
      }
    }
    dir = path.dirname(dir);
  }
  fail("could not locate the drizzle-kit package");
}

function migrate(url) {
  console.log("migrate-and-verify: applying migrations over the direct connection");
  const result = spawnSync(process.execPath, [drizzleKitCli(), "migrate"], {
    cwd: webRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.error !== undefined) {
    fail(`could not start drizzle-kit (${result.error.code ?? "unknown"})`);
  }
  if (result.status !== 0) {
    fail(`drizzle-kit migrate exited with code ${result.status ?? "unknown"}`);
  }
}

async function verifyTables(url) {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 15_000,
  });
  try {
    await client.connect();
    const result = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    const present = new Set(result.rows.map((row) => row.tablename));
    const missing = EXPECTED_TABLES.filter((table) => !present.has(table));

    console.log(
      `migrate-and-verify: ${present.size} public tables, ${EXPECTED_TABLES.length} expected`,
    );
    if (missing.length > 0) {
      console.error(`migrate-and-verify: missing tables: ${missing.join(", ")}`);
      return false;
    }
    console.log("migrate-and-verify: all 15 expected tables present");
    return true;
  } catch (error) {
    // Never surface a driver message: it can contain host or credential text.
    console.error(`migrate-and-verify: database verification failed (${error?.code ?? "unknown"})`);
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function pingHealth() {
  if (process.env.SKIP_HEALTH === "1") {
    console.log("migrate-and-verify: health check skipped (SKIP_HEALTH=1)");
    return true;
  }
  const healthUrl = process.env.HEALTH_URL ?? DEFAULT_HEALTH_URL;
  if (healthUrl.trim() === "") {
    console.log("migrate-and-verify: health check skipped (HEALTH_URL is empty)");
    return true;
  }

  try {
    const response = await fetch(healthUrl, {
      headers: { "cache-control": "no-store" },
      signal: AbortSignal.timeout(15_000),
    });
    let status = "unparsed";
    try {
      const body = await response.json();
      status = typeof body?.status === "string" ? body.status : "missing";
    } catch {
      status = "unparsed";
    }
    console.log(`migrate-and-verify: health ${response.status} status=${status}`);
    return response.ok;
  } catch (error) {
    console.error(`migrate-and-verify: health check failed (${error?.name ?? "unknown"})`);
    return false;
  }
}

const url = directUrl();
migrate(url);
const tablesOk = await verifyTables(url);
const healthOk = await pingHealth();
if (!tablesOk || !healthOk) {
  process.exit(1);
}
console.log("migrate-and-verify: OK");
