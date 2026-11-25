#!/usr/bin/env node
/**
 * Continuous live-endpoint smoke verifier.
 *
 *   BASE_URL=https://inkwellio.vercel.app \
 *     pnpm --filter @inkwellio/web smoke:live
 *
 * Checks the deployed site, not the source tree:
 *
 * 1. Public API: `/api/health` (200 and `status: "ok"`), `/api/topics` and
 *    `/api/search?q=football` (200 with a JSON body).
 * 2. Public pages: `/`, `/topics`, `/search` answer 200.
 * 3. Security headers on `/`: `x-content-type-options: nosniff`, a
 *    `referrer-policy`, and a content security policy. The repository ships the
 *    public-page policy as `Content-Security-Policy-Report-Only` (A13), so both
 *    the enforced and the report-only header satisfy this check; the output
 *    names which one was seen.
 * 4. Protected write/owner endpoints fail closed: an unauthenticated request
 *    must be 401, never a write. The script sends no cookies, so a 401 here is
 *    also proof that nothing mutated.
 *
 * Every request uses `AbortSignal.timeout(10000)` and reports latency in ms.
 * Any failed check makes the process exit non-zero; a human runs this, and the
 * scheduled workflow treats a non-zero exit as a red build.
 *
 * Uses Node built-ins only (fetch, AbortSignal, performance). No dependency is
 * added to the app for an ops check.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "https://inkwellio.vercel.app";
const REQUEST_TIMEOUT_MS = 10_000;
/**
 * Resolve and normalise the target. A trailing slash is stripped instead of
 * producing `//api/health`; anything that is not an absolute http(s) URL is a
 * configuration error and fails before a single request is made.
 */
export function resolveBaseUrl(raw = process.env.BASE_URL) {
  const value = (raw ?? DEFAULT_BASE_URL).trim();
  if (value === "") throw new Error("BASE_URL is empty");
  const normalised = value.replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(normalised);
  } catch {
    throw new Error(`BASE_URL is not a valid absolute URL: ${normalised}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`BASE_URL must use http or https, got ${parsed.protocol}`);
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new Error("BASE_URL must not contain a query string or fragment");
  }
  return normalised;
}

function elapsed(startedAt) {
  return Math.round(performance.now() - startedAt);
}

async function request(fetchImpl, url, init) {
  const startedAt = performance.now();
  try {
    const response = await fetchImpl(url, {
      ...init,
      // A redirect is never the answer we asserted; surface it as its own 3xx.
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    return {
      response,
      status: response.status,
      headers: response.headers,
      text,
      ms: elapsed(startedAt),
    };
  } catch (error) {
    return { error, ms: elapsed(startedAt) };
  }
}

function describeError(error) {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return `timed out after ${REQUEST_TIMEOUT_MS} ms`;
    }
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function parsedJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function result(ok, outcome, detail) {
  const http = outcome.error ? "ERR" : String(outcome.status);
  return { ok, ms: outcome.ms, http, detail };
}

const pass = (outcome, detail) => result(true, outcome, detail);
const fail = (outcome, detail) => result(false, outcome, detail);

function jsonCheck(name, path, verify) {
  return {
    name,
    async run(fetchImpl, baseUrl) {
      const outcome = await request(fetchImpl, `${baseUrl}${path}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (outcome.error) return fail(outcome, describeError(outcome.error));
      if (outcome.status !== 200) return fail(outcome, `expected 200, got ${outcome.status}`);
      const body = parsedJson(outcome.text);
      if (!body.ok) return fail(outcome, "response body was not JSON");
      return verify(outcome, body.value);
    },
  };
}

function pageCheck(name, path) {
  return {
    name,
    async run(fetchImpl, baseUrl) {
      const outcome = await request(fetchImpl, `${baseUrl}${path}`, {
        method: "GET",
        headers: { accept: "text/html" },
      });
      if (outcome.error) return fail(outcome, describeError(outcome.error));
      if (outcome.status !== 200) return fail(outcome, `expected 200, got ${outcome.status}`);
      return pass(outcome, "page rendered");
    },
  };
}

const PROTECTED_ENDPOINTS = [
  { name: "POST /api/publications", method: "POST", path: "/api/publications" },
  { name: "POST /api/posts", method: "POST", path: "/api/posts" },
  {
    name: "PUT /api/posts/00000000-0000-0000-0000-000000000000/topics",
    method: "PUT",
    path: "/api/posts/00000000-0000-0000-0000-000000000000/topics",
  },
  { name: "GET /api/account/export", method: "GET", path: "/api/account/export" },
  {
    name: "POST /api/account/erasure/request",
    method: "POST",
    path: "/api/account/erasure/request",
  },
  { name: "DELETE /api/account", method: "DELETE", path: "/api/account" },
];

function protectedCheck(endpoint) {
  return {
    name: endpoint.name,
    async run(fetchImpl, baseUrl) {
      const hasBody = endpoint.method !== "GET";
      const outcome = await request(fetchImpl, `${baseUrl}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          accept: "application/json",
          ...(hasBody ? { "content-type": "application/json" } : {}),
        },
        ...(hasBody ? { body: "{}" } : {}),
      });
      if (outcome.error) return fail(outcome, describeError(outcome.error));
      if (outcome.status !== 401) {
        return fail(outcome, `expected 401 (fail closed), got ${outcome.status}`);
      }
      return pass(outcome, "fail-closed 401, no cookies sent");
    },
  };
}

function securityHeadersCheck() {
  return {
    name: "GET / (security headers)",
    async run(fetchImpl, baseUrl) {
      const outcome = await request(fetchImpl, `${baseUrl}/`, {
        method: "GET",
        headers: { accept: "text/html" },
      });
      if (outcome.error) return fail(outcome, describeError(outcome.error));
      if (outcome.status !== 200) return fail(outcome, `expected 200, got ${outcome.status}`);

      const csp = outcome.headers.get("content-security-policy");
      const reportOnly = outcome.headers.get("content-security-policy-report-only");
      const problems = [];
      if (outcome.headers.get("x-content-type-options") !== "nosniff") {
        problems.push("x-content-type-options is not nosniff");
      }
      if (!outcome.headers.get("referrer-policy")) {
        problems.push("referrer-policy is missing");
      }
      if (!csp && !reportOnly) {
        problems.push("content-security-policy is missing");
      }
      if (problems.length > 0) return fail(outcome, problems.join("; "));

      const policy = csp ? "enforced" : "report-only";
      return pass(outcome, `nosniff, referrer-policy, csp=${policy}`);
    },
  };
}

export function buildChecks() {
  return [
    jsonCheck("GET /api/health", "/api/health", (outcome, body) => {
      if (body === null || typeof body !== "object" || body.status !== "ok") {
        return fail(outcome, `body.status=${JSON.stringify(body?.status)} expected "ok"`);
      }
      return pass(outcome, "body.status=ok");
    }),
    jsonCheck("GET /api/topics", "/api/topics", (outcome, body) => {
      if (body === null || typeof body !== "object" || !Array.isArray(body.topics)) {
        return fail(outcome, "body.topics is not an array");
      }
      return pass(outcome, `body.topics=${body.topics.length}`);
    }),
    jsonCheck("GET /api/search?q=football", "/api/search?q=football", (outcome, body) => {
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return fail(outcome, "body is not a JSON object");
      }
      const items = Array.isArray(body.items) ? `items=${body.items.length}` : "items absent";
      return pass(outcome, `JSON object, ${items}`);
    }),
    pageCheck("GET /", "/"),
    pageCheck("GET /topics", "/topics"),
    pageCheck("GET /search", "/search"),
    securityHeadersCheck(),
    ...PROTECTED_ENDPOINTS.map(protectedCheck),
  ];
}

export async function runSmoke({ baseUrl, fetchImpl = fetch, log = console.log }) {
  log(`smoke-live: base=${baseUrl} timeout=${REQUEST_TIMEOUT_MS}ms`);
  const checks = buildChecks();
  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    const outcome = await check.run(fetchImpl, baseUrl);
    const label = outcome.ok ? "PASS" : "FAIL";
    log(`${label}  ${check.name}  HTTP ${outcome.http}  ${outcome.ms} ms  ${outcome.detail}`);
    if (outcome.ok) passed += 1;
    else failed += 1;
  }

  log(`smoke-live: ${passed} passed, ${failed} failed (${checks.length} checks)`);
  log(failed === 0 ? "smoke-live: OK" : "smoke-live: FAILED");
  return { passed, failed };
}

async function main() {
  let baseUrl;
  try {
    baseUrl = resolveBaseUrl();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`smoke-live: ${message}`);
    process.exitCode = 1;
    return;
  }

  const { failed } = await runSmoke({ baseUrl });
  if (failed > 0) process.exitCode = 1;
}

const entry = process.argv[1];
if (entry !== undefined && path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
