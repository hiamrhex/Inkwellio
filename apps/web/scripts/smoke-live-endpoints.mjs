#!/usr/bin/env node
/**
 * Continuous live-endpoint smoke verifier.
 *
 *   BASE_URL=https://inkwellio.vercel.app \
 *     pnpm --filter @inkwellio/web smoke:live
 *
 * Checks the deployed site, not the source tree. No cookies are sent, so a
 * 401 on an owner endpoint is also proof that no write happened. The only
 * POST to the auth route is a method probe (`POST /api/auth/get-session`),
 * which is rejected with 405 and creates no data — production DB mutation is
 * explicitly out of scope.
 *
 * Every method/path pair declared under `apps/web/src/app/api/**` is covered:
 *
 * - public 200: health, topics, search, auth get-session, plus the 404 of a
 *   missing published post (the public post read);
 * - auth POST route probed without mutation;
 * - 16 owner/account endpoints must answer 401 unauthenticated;
 * - public pages `/`, `/topics`, `/search` and the security headers on `/`.
 *
 * The repository ships the public-page CSP as `Content-Security-Policy-Report-Only`
 * (A13), so both the enforced and report-only header satisfy the header check;
 * the output names which one was seen.
 *
 * Every request uses `AbortSignal.timeout(10000)` and reports latency in ms.
 * Any failed check makes the process exit non-zero; the scheduled workflow
 * treats that as a red build.
 *
 * Uses Node built-ins only (fetch, AbortSignal, performance). No dependency is
 * added to the app for an ops check.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "https://inkwellio.vercel.app";
const REQUEST_TIMEOUT_MS = 10_000;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const MIN_SEED_TOPICS = 12;

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

function statusCheck(name, method, path, expectedStatus, detail) {
  return {
    name,
    async run(fetchImpl, baseUrl) {
      const hasBody = method !== "GET";
      const outcome = await request(fetchImpl, `${baseUrl}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(hasBody ? { "content-type": "application/json" } : {}),
        },
        ...(hasBody ? { body: "{}" } : {}),
      });
      if (outcome.error) return fail(outcome, describeError(outcome.error));
      if (outcome.status !== expectedStatus) {
        return fail(outcome, `expected ${expectedStatus}, got ${outcome.status}`);
      }
      return pass(outcome, detail);
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

/**
 * Every authenticated/owner method/path in the API tree. `policy.ts` marks
 * each of these `authenticated`; the handlers call `requireUser` (or identity's
 * session check) before a service call, so an absent cookie must be 401.
 */
const PROTECTED_ENDPOINTS = [
  { name: "GET /api/publications", method: "GET", path: "/api/publications" },
  { name: "POST /api/publications", method: "POST", path: "/api/publications" },
  {
    name: `GET /api/publications/${ZERO_UUID}`,
    method: "GET",
    path: `/api/publications/${ZERO_UUID}`,
  },
  { name: "POST /api/posts", method: "POST", path: "/api/posts" },
  {
    name: `GET /api/posts/${ZERO_UUID}/draft`,
    method: "GET",
    path: `/api/posts/${ZERO_UUID}/draft`,
  },
  {
    name: `PUT /api/posts/${ZERO_UUID}/draft`,
    method: "PUT",
    path: `/api/posts/${ZERO_UUID}/draft`,
  },
  {
    name: `POST /api/posts/${ZERO_UUID}/publish`,
    method: "POST",
    path: `/api/posts/${ZERO_UUID}/publish`,
  },
  {
    name: `POST /api/posts/${ZERO_UUID}/unpublish`,
    method: "POST",
    path: `/api/posts/${ZERO_UUID}/unpublish`,
  },
  {
    name: `POST /api/posts/${ZERO_UUID}/slug`,
    method: "POST",
    path: `/api/posts/${ZERO_UUID}/slug`,
  },
  {
    name: `POST /api/posts/${ZERO_UUID}/delete`,
    method: "POST",
    path: `/api/posts/${ZERO_UUID}/delete`,
  },
  {
    name: `POST /api/posts/${ZERO_UUID}/restore`,
    method: "POST",
    path: `/api/posts/${ZERO_UUID}/restore`,
  },
  {
    name: `PUT /api/posts/${ZERO_UUID}/topics`,
    method: "PUT",
    path: `/api/posts/${ZERO_UUID}/topics`,
  },
  { name: "GET /api/account/export", method: "GET", path: "/api/account/export" },
  {
    name: "POST /api/account/erasure/request",
    method: "POST",
    path: "/api/account/erasure/request",
  },
  {
    name: "POST /api/account/erasure/confirm",
    method: "POST",
    path: "/api/account/erasure/confirm",
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
      if (body.topics.length < MIN_SEED_TOPICS) {
        return fail(outcome, `body.topics=${body.topics.length} expected >= ${MIN_SEED_TOPICS}`);
      }
      return pass(outcome, `body.topics=${body.topics.length} (>= ${MIN_SEED_TOPICS})`);
    }),
    jsonCheck("GET /api/search?q=football", "/api/search?q=football", (outcome, body) => {
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return fail(outcome, "body is not a JSON object");
      }
      const items = Array.isArray(body.items) ? `items=${body.items.length}` : "items absent";
      return pass(outcome, `JSON object, ${items}`);
    }),
    jsonCheck("GET /api/auth/get-session", "/api/auth/get-session", (outcome, body) => {
      if (body !== null) return fail(outcome, `expected null session, got ${JSON.stringify(body)}`);
      return pass(outcome, "unauthenticated null session");
    }),
    // The auth route also declares POST. A method probe is the only safe way
    // to exercise it live: a real sign-up would mutate the production DB.
    statusCheck(
      "POST /api/auth/[...all] (method probe)",
      "POST",
      "/api/auth/get-session",
      405,
      "rejected without creating a session",
    ),
    statusCheck(
      `GET /api/posts/${ZERO_UUID}`,
      "GET",
      `/api/posts/${ZERO_UUID}`,
      404,
      "missing post is indistinguishable and public",
    ),
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
