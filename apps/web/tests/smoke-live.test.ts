import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/**
 * The live smoke verifier is only useful if a red site actually turns it red.
 * These tests run the real script as a child process against a local
 * `http.createServer` fixture, so the proof is the process exit code, not a
 * stubbed assertion helper. The fixture answers every method/path the script
 * checks, including the 22 API pairs, the three pages and the CSP headers.
 */

const testDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(testDir, "../scripts/smoke-live-endpoints.mjs");
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
} as const;

const PROTECTED_PATHS = new Set([
  "/api/publications",
  `/api/publications/${ZERO_UUID}`,
  "/api/posts",
  `/api/posts/${ZERO_UUID}/draft`,
  `/api/posts/${ZERO_UUID}/publish`,
  `/api/posts/${ZERO_UUID}/unpublish`,
  `/api/posts/${ZERO_UUID}/slug`,
  `/api/posts/${ZERO_UUID}/delete`,
  `/api/posts/${ZERO_UUID}/restore`,
  `/api/posts/${ZERO_UUID}/topics`,
  "/api/account/export",
  "/api/account/erasure/request",
  "/api/account/erasure/confirm",
  "/api/account",
]);

type Overrides = {
  healthStatus?: number;
  publicationsStatus?: number;
  topicsCount?: number;
  sessionStatus?: number;
  sessionBody?: unknown;
  missingPostStatus?: number;
};

let server: Server | undefined;

async function startServer(overrides: Overrides = {}): Promise<string> {
  const created = createServer((request, response) => {
    request.resume();
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    const json = (status: number, body: unknown): void => {
      response.writeHead(status, {
        ...SECURITY_HEADERS,
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify(body));
    };

    if (request.method === "GET" && url.pathname === "/api/health") {
      const status = overrides.healthStatus ?? 200;
      json(status, status === 200 ? { status: "ok" } : { status: "unavailable" });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/topics") {
      const count = overrides.topicsCount ?? 12;
      json(200, {
        topics: Array.from({ length: count }, (_, i) => ({
          id: `topic-${i}`,
          slug: `topic-${i}`,
          name: `Topic ${i}`,
          publishedCount: 0,
        })),
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/search") {
      json(200, { query: url.searchParams.get("q"), items: [], nextCursor: null });
      return;
    }
    if (url.pathname === "/api/auth/get-session") {
      if (request.method === "POST") {
        json(405, { code: "METHOD_NOT_ALLOWED", message: "method not allowed" });
        return;
      }
      const status = overrides.sessionStatus ?? 200;
      json(status, "sessionBody" in overrides ? overrides.sessionBody : null);
      return;
    }
    if (request.method === "GET" && url.pathname === `/api/posts/${ZERO_UUID}`) {
      json(overrides.missingPostStatus ?? 404, { code: "NOT_FOUND", status: 404 });
      return;
    }
    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/topics" || url.pathname === "/search")
    ) {
      response.writeHead(200, {
        ...SECURITY_HEADERS,
        "content-type": "text/html; charset=utf-8",
      });
      response.end("<!doctype html><html><body>ok</body></html>");
      return;
    }
    if (PROTECTED_PATHS.has(url.pathname)) {
      if (
        url.pathname === "/api/publications" &&
        request.method === "POST" &&
        overrides.publicationsStatus === 200
      ) {
        json(200, { id: "leaked-write" });
        return;
      }
      json(401, { code: "UNAUTHORIZED", message: "Authentication required" });
      return;
    }

    json(404, { code: "NOT_FOUND" });
  });

  server = created;
  await new Promise<void>((resolve, reject) => {
    created.once("error", reject);
    created.listen(0, "127.0.0.1", resolve);
  });
  const address = created.address();
  if (address === null || typeof address === "string") {
    throw new Error("The fixture server did not bind a TCP port");
  }
  return `http://127.0.0.1:${address.port}`;
}

type RunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

/**
 * `execFile`, not `spawnSync`: the fixture server lives in this process, so a
 * synchronous child would deadlock waiting for a response this event loop can
 * never send.
 */
async function runSmoke(baseUrl: string): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath], {
      env: { ...process.env, BASE_URL: baseUrl, NO_COLOR: "1" },
      encoding: "utf8",
      timeout: 60_000,
    });
    return { status: 0, stdout, stderr };
  } catch (error) {
    const failure = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: typeof failure.code === "number" ? failure.code : null,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

afterEach(async () => {
  if (server === undefined) return;
  const closing = server;
  server = undefined;
  await new Promise<void>((resolve) => closing.close(() => resolve()));
});

describe("live endpoint smoke verifier", () => {
  it("exits 0 when every check passes", async () => {
    const baseUrl = await startServer();
    const result = await runSmoke(baseUrl);

    expect(result.status, result.stderr).toBe(0);
    for (const line of [
      "PASS  GET /api/health",
      "PASS  GET /api/topics",
      "PASS  GET /api/search?q=football",
      "PASS  GET /api/auth/get-session",
      "PASS  POST /api/auth/[...all] (method probe)",
      `PASS  GET /api/posts/${ZERO_UUID}`,
      "PASS  GET /",
      "PASS  GET /topics",
      "PASS  GET /search",
      "PASS  GET / (security headers)",
      "PASS  GET /api/publications",
      "PASS  DELETE /api/account",
      `PASS  PUT /api/posts/${ZERO_UUID}/topics`,
    ]) {
      expect(result.stdout, `missing ${line}`).toContain(line);
    }
    expect(result.stdout).toContain("smoke-live: 26 passed, 0 failed (26 checks)");
    expect(result.stdout).toContain("smoke-live: OK");
  }, 60_000);

  it("normalises a trailing slash in BASE_URL instead of double-slashing paths", async () => {
    const baseUrl = await startServer();
    const result = await runSmoke(`${baseUrl}/`);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`base=${baseUrl} timeout=`);
    expect(result.stdout).not.toContain(`base=${baseUrl}/ timeout=`);
  }, 60_000);

  it("exits 1 when a protected endpoint returns 200 instead of 401", async () => {
    const baseUrl = await startServer({ publicationsStatus: 200 });
    const result = await runSmoke(baseUrl);

    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("FAIL  POST /api/publications");
    expect(result.stdout).toContain("expected 401 (fail closed), got 200");
    expect(result.stdout).toContain("smoke-live: 25 passed, 1 failed (26 checks)");
    expect(result.stdout).toContain("smoke-live: FAILED");
  }, 60_000);

  it("exits 1 when /api/health returns 500", async () => {
    const baseUrl = await startServer({ healthStatus: 500 });
    const result = await runSmoke(baseUrl);

    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("FAIL  GET /api/health");
    expect(result.stdout).toContain("expected 200, got 500");
    expect(result.stdout).toContain("smoke-live: FAILED");
  }, 60_000);

  it("exits 1 when the curated topic seed regresses below 12", async () => {
    const baseUrl = await startServer({ topicsCount: 5 });
    const result = await runSmoke(baseUrl);

    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("FAIL  GET /api/topics");
    expect(result.stdout).toContain("body.topics=5 expected >= 12");
    expect(result.stdout).toContain("smoke-live: FAILED");
  }, 60_000);

  it("exits 1 when get-session stops returning an unauthenticated null session", async () => {
    const baseUrl = await startServer({ sessionBody: { user: { id: "leaked-session" } } });
    const result = await runSmoke(baseUrl);

    // A 200 with a session body is rejected; the fixture's default null passes.
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("FAIL  GET /api/auth/get-session");
    expect(result.stdout).toContain("smoke-live: FAILED");
  }, 60_000);

  it("exits 1 when a missing published post stops being 404", async () => {
    const baseUrl = await startServer({ missingPostStatus: 200 });
    const result = await runSmoke(baseUrl);

    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain(`FAIL  GET /api/posts/${ZERO_UUID}`);
    expect(result.stdout).toContain("expected 404");
    expect(result.stdout).toContain("smoke-live: FAILED");
  }, 60_000);
});
