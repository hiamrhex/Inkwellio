import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The response as a browser receives it, from the real production server.
 *
 * Unit tests can prove a string is absent from a source file; only a started
 * server can prove it is absent from a header. `pnpm check` builds before it
 * tests, so `next start` has something to start.
 *
 * Nothing here contacts the database, and `DATABASE_URL` is deliberately not
 * required: these routes must answer without one.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webDir = path.join(repoRoot, "apps", "web");
const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");

const START_TIMEOUT_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let server: ChildProcess | undefined;
let baseUrl = "";
let startupLog = "";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close();
        reject(new Error("could not reserve a port"));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

async function waitUntilServing(url: string): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(
        `next start exited with ${server.exitCode} before serving.\n${startupLog}`,
      );
    }
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`next start did not answer within ${START_TIMEOUT_MS} ms.\n${startupLog}`);
}

function stopServer(): void {
  if (server?.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    // `next start` may own child processes; kill the tree, not the wrapper.
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    server.kill("SIGTERM");
  }
  server = undefined;
}

beforeAll(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;

  server = spawn(
    process.execPath,
    [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: webDir,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const capture = (chunk: Buffer) => {
    startupLog += chunk.toString();
  };
  server.stdout?.on("data", capture);
  server.stderr?.on("data", capture);

  await waitUntilServing(baseUrl);
}, START_TIMEOUT_MS + 15_000);

afterAll(() => {
  stopServer();
});

async function get(pathname: string): Promise<Response> {
  return fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
}

describe("the production server hides what it can", () => {
  it("sets no x-powered-by header, on any response", async () => {
    for (const pathname of ["/", "/health", "/this-page-does-not-exist"]) {
      const response = await get(pathname);
      expect(response.headers.get("x-powered-by"), `${pathname} advertised the framework`).toBeNull();
    }
  });

  it("returns a fixed liveness body, and nothing else", async () => {
    const response = await get("/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe('{"status":"ok"}');
  });

  it("issues a fresh request id per call, so the route is not cached", async () => {
    const first = await get("/health");
    const second = await get("/health");

    const a = first.headers.get("x-request-id");
    const b = second.headers.get("x-request-id");

    expect(a).toMatch(UUID);
    expect(b).toMatch(UUID);
    expect(a).not.toBe(b);
  });

  it("shows no version, generator tag or build path on the home page", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);

    const html = await response.text();
    const headers = JSON.stringify([...response.headers]);

    expect(html).not.toMatch(/<meta[^>]+name=["']generator["']/i);
    expect(headers).not.toContain("16.4.");
    for (const needle of ["16.4.", "v16.", "C:\\Users", "/home/runner", "postgres://"]) {
      expect(html, `"${needle}" appeared in the home page`).not.toContain(needle);
    }
  });

  it("serves a 404 that reveals nothing about what failed", async () => {
    const response = await get("/this-page-does-not-exist");

    expect(response.status).toBe(404);

    const body = await response.text();
    expect(body).toContain("Not found");
    for (const needle of [
      "SQLSTATE",
      "SELECT",
      "    at ",
      "node_modules",
      "stack",
      "C:\\Users",
    ]) {
      expect(body, `"${needle}" appeared in the 404 body`).not.toContain(needle);
    }
  });

  it("ships no source map and does not serve one on request", async () => {
    const html = await (await get("/")).text();
    const asset = /\/_next\/static\/[^"\\]+?\.js/.exec(html)?.[0];

    expect(asset, "the home page must reference at least one client chunk").toBeDefined();
    if (asset === undefined) {
      return;
    }

    const script = await get(asset);
    expect(script.status).toBe(200);
    expect(script.headers.get("x-powered-by")).toBeNull();

    const map = await get(`${asset}.map`);
    expect(map.status).toBe(404);
  });
});
