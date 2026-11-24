import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import nextConfig from "../next.config";

/**
 * WP4 / A13: Caching config, rewrites, CSP, and security headers.
 *
 * Verifies both next.config.ts declarations and real HTTP responses
 * served by `next start` across routes, API endpoints, and static assets.
 */

const EXPECTED_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
};

const EXPECTED_REPORT_ONLY_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const EXPECTED_API_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

describe("WP4 / A13: next.config.ts caching, rewrites, and security headers", () => {
  it("enables cacheComponents, partialPrefetching, and A9 cacheLife profiles", () => {
    expect(nextConfig.cacheComponents).toBe(true);
    expect(nextConfig.partialPrefetching).toBe(true);
    expect(nextConfig.cacheLife?.post).toEqual({
      stale: 60,
      revalidate: 60,
      expire: 3600,
    });
    expect(nextConfig.cacheLife?.feed).toEqual({
      stale: 60,
      revalidate: 60,
      expire: 300,
    });
  });

  it("configures /@handle and /@handle/slug rewrites per ADR-011", async () => {
    expect(nextConfig.rewrites).toBeTypeOf("function");
    if (!nextConfig.rewrites) return;
    const rewrites = await nextConfig.rewrites();
    expect(rewrites).toEqual([
      { source: "/@:handle", destination: "/p/:handle" },
      { source: "/@:handle/:slug", destination: "/p/:handle/:slug" },
    ]);
  });

  it("configures all 7 A13 security headers and CSP without script-src 'unsafe-inline'", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");
    if (!nextConfig.headers) return;

    const rules = await nextConfig.headers();
    const rootRule = rules.find((r) => r.source === "/:path*");
    expect(rootRule).toBeDefined();
    if (!rootRule) return;

    const map = new Map(rootRule.headers.map((h) => [h.key.toLowerCase(), h.value]));
    for (const [key, expected] of Object.entries(EXPECTED_HEADERS)) {
      expect(map.get(key), `missing or mismatched ${key}`).toBe(expected);
    }

    const reportOnly = map.get("content-security-policy-report-only");
    expect(reportOnly).toBe(EXPECTED_REPORT_ONLY_CSP);
    expect(reportOnly).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const webDir = path.join(repoRoot, "apps", "web");
const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const START_TIMEOUT_MS = 60_000;

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
      throw new Error(`next start exited with ${server.exitCode}.\n${startupLog}`);
    }
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // Wait for server socket
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`next start did not answer within ${START_TIMEOUT_MS} ms.\n${startupLog}`);
}

function stopServer(): void {
  if (server?.pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    server.kill("SIGTERM");
  }
  server = undefined;
}

describe("WP4 / A13: production server security headers and CSP", () => {
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

  async function assertSecurityHeaders(pathname: string) {
    const res = await fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
    for (const [key, expected] of Object.entries(EXPECTED_HEADERS)) {
      expect(res.headers.get(key), `${pathname} header ${key}`).toBe(expected);
    }
    expect(res.headers.get("content-security-policy-report-only")).toBe(
      EXPECTED_REPORT_ONLY_CSP,
    );
  }

  it("sets all 7 security headers and report-only CSP on /", async () => {
    await assertSecurityHeaders("/");
  });

  it("sets all 7 security headers on 404 responses", async () => {
    await assertSecurityHeaders("/does-not-exist-404");
  });

  it("sets enforced CSP on /api/health", async () => {
    const res = await fetch(`${baseUrl}/api/health`, { redirect: "manual" });
    expect(res.headers.get("content-security-policy")).toBe(EXPECTED_API_CSP);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("sets scoped cross-origin CORP on static assets", async () => {
    const homeHtml = await (await fetch(`${baseUrl}/`)).text();
    const assetPath = /\/_next\/static\/[^"\\]+?\.js/.exec(homeHtml)?.[0];
    expect(assetPath, "home page must reference a static JS chunk").toBeDefined();
    if (!assetPath) return;

    const assetRes = await fetch(`${baseUrl}${assetPath}`, { redirect: "manual" });
    expect(assetRes.status).toBe(200);
    expect(assetRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(assetRes.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  });
});
