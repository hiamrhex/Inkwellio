/**
 * Local red-team drill runner.
 *
 * Runs only against a local `next start` and the local Postgres on port 55433.
 * No external host is contacted. It never asserts a result it did not observe:
 * every drill prints its actual status/body excerpt and the runner exits 1 if
 * a hard expectation fails.
 *
 *   node apps/web/tests/manual/red-team-drills.mjs             # drills
 *   node apps/web/tests/manual/red-team-drills.mjs --cleanup   # remove QA rows
 */
import { Client } from "pg";

const BASE = process.env.DRILL_BASE_URL || "http://127.0.0.1:3100";
const DB = process.env.DATABASE_URL || "postgresql://postgres@localhost:55433/inkwellio";
const EMAIL_SUFFIX = `wp8drill-${Date.now()}`;
const results = [];

function record(id, name, expected, actual, pass, severity = "info") {
  const row = { id, name, expected, actual, pass, severity };
  results.push(row);
  console.log(JSON.stringify(row));
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    ...options,
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return {
    status: response.status,
    headers: response.headers,
    text,
    json,
    retryAfter: response.headers.get("retry-after"),
    contentType: response.headers.get("content-type") ?? "",
    csp: response.headers.get("content-security-policy"),
    cspReportOnly: response.headers.get("content-security-policy-report-only"),
  };
}

function signUpBody(email) {
  return JSON.stringify({
    email,
    password: "DrillPassword-2026!",
    name: "WP8 Drill",
  });
}

function postAuth(path, email, extraHeaders = {}) {
  return request(`/api/auth/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-forwarded-for": "198.51.100.10",
      ...extraHeaders,
    },
    body: signUpBody(email),
  });
}

async function drillHealth() {
  const res = await request("/api/health");
  record(
    "D1",
    "health endpoint responds",
    "200",
    `${res.status} ${res.text.slice(0, 80)}`,
    res.status === 200,
  );
}

async function drillRateLimitShape() {
  const email = `rate-${EMAIL_SUFFIX}@example.com`;
  const statuses = [];
  let limited;
  for (let i = 0; i < 6; i += 1) {
    const res = await postAuth("sign-up/email", email, { "x-request-id": `drill-rate-${i}` });
    statuses.push(res.status);
    if (res.status === 429) limited = res;
  }
  const shapeOk =
    limited !== undefined &&
    limited.json?.code === "RATE_LIMITED" &&
    typeof limited.json?.requestId === "string" &&
    /^\d+$/.test(limited.retryAfter ?? "");
  record(
    "D2",
    "six sign-ups from one IP/identifier produce a uniform 429",
    "429 with code=RATE_LIMITED, requestId, Retry-After",
    `${statuses.join(",")} | limited=${limited ? JSON.stringify(limited.json) : "none"} | retry-after=${limited?.retryAfter ?? "none"}`,
    shapeOk,
    "medium",
  );
  return limited;
}

async function drillSpoofedXff() {
  const email = `spoof-${EMAIL_SUFFIX}@example.com`;
  const statuses = [];
  for (let i = 0; i < 7; i += 1) {
    const res = await postAuth("sign-up/email", email, {
      // Rotate the client-controlled header; keep the platform header pinned.
      "x-forwarded-for": `203.0.113.${i + 1}`,
    });
    statuses.push(res.status);
  }
  // A second identifier from the same pinned IP is still capped after 5.
  const limited = statuses.slice(5).every((status) => status === 429);
  record(
    "D3",
    "rotating X-Forwarded-For cannot reset the pinned bucket",
    "attempts 6 and 7 are 429",
    statuses.join(","),
    limited,
    "high",
  );
}

async function drillClientIsolation() {
  const email = `other-${EMAIL_SUFFIX}@example.com`;
  const res = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-forwarded-for": "198.51.100.77",
    },
    body: signUpBody(email),
  });
  record(
    "D4",
    "a different client IP and identifier is not locked out",
    "not 429",
    `${res.status} ${res.text.slice(0, 100)}`,
    res.status !== 429,
    "high",
  );
}

async function drillVerificationFailureShape() {
  const res = await request("/api/auth/send-verification-email", {
    method: "POST",
    headers: { "content-type": "application/json", "x-vercel-forwarded-for": "198.51.100.88" },
    body: JSON.stringify({ email: "nobody@example.test" }),
  });
  const isJson = res.json !== undefined;
  const noStack = !/at\s+\/|node_modules|DATABASE_URL|ECONNREFUSED/.test(res.text);
  record(
    "D5",
    "unauthenticated verification-email request answers structured JSON",
    "JSON body, no stack trace or empty 500",
    `${res.status} ${res.text.slice(0, 150)}`,
    isJson && noStack && res.status < 500,
    "high",
  );
}

async function drillForeignOrigin() {
  const res = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.test",
      "x-vercel-forwarded-for": "198.51.100.99",
    },
    body: JSON.stringify({ email: "drill@example.test", password: "DrillPassword-2026!" }),
  });
  record(
    "D6",
    "foreign origin is refused",
    "403 or explicit INVALID_ORIGIN, not a session",
    `${res.status} ${res.text.slice(0, 150)}`,
    res.status === 403 || /INVALID_ORIGIN/i.test(res.text),
    "high",
  );
}

async function drillSearchProbes() {
  const probes = [
    ["sql", "' OR 1=1 --"],
    ["xss", "<script>alert(1)</script>"],
    ["path", "../../etc/passwd"],
    ["huge", "a".repeat(500)],
  ];
  for (const [name, q] of probes) {
    const res = await request(`/api/search?q=${encodeURIComponent(q)}`);
    // The property that matters is the response's content type: a `<script>`
    // string inside `application/json` is data, not executable markup. The
    // search page renders `query` with React (`{results.query}`), which escapes
    // it. There is no `dangerouslySetInnerHTML` in apps/web/src/app/search.
    const clean =
      res.status < 500 &&
      res.contentType.startsWith("application/json") &&
      !/node_modules|DATABASE_URL|stack trace/.test(res.text);
    record(
      `D7-${name}`,
      `search probe: ${name}`,
      "JSON content type, no 5xx, no stack or SQL leak",
      `${res.status} ${res.contentType} ${res.text.slice(0, 120)}`,
      clean,
      "medium",
    );
  }
}

async function drillOversizedBody() {
  const res = await request("/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-vercel-forwarded-for": "198.51.100.10" },
    body: JSON.stringify({ title: "x", bodyMarkdown: "m".repeat(2_000_000) }),
  });
  record(
    "D8",
    "oversized anonymous write is refused without a 5xx",
    "401/413/400 with JSON",
    `${res.status} ${res.text.slice(0, 120)}`,
    [400, 401, 413].includes(res.status) && res.json !== undefined,
    "medium",
  );
}

async function drillHeaders() {
  const html = await request("/privacy");
  const api = await request("/api/health");
  record(
    "D9",
    "HTML CSP is report-only (Next.js hydration safe)",
    "content-security-policy-report-only present",
    `html=${html.cspReportOnly ? "report-only" : "absent"} api=${api.csp ?? "absent"}`,
    Boolean(html.cspReportOnly) && Boolean(api.csp),
    "low",
  );
}

/** Sign up and sign in a local QA account; returns its cookie header. */
async function makeUser(label, ip) {
  const email = `${label}-${EMAIL_SUFFIX}@example.com`;
  const headers = {
    "content-type": "application/json",
    origin: BASE,
    "x-vercel-forwarded-for": ip,
  };
  const signUp = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers,
    body: signUpBody(email),
  });
  // The app requires verified email. The dev transport captures the link in
  // the server process, which a black-box client cannot read, so the drill
  // verifies the local QA row directly. This is a local-only fixture change.
  const verifier = new Client({ connectionString: DB });
  await verifier.connect();
  try {
    await verifier.query("update users set email_verified = true where email = $1", [email]);
  } finally {
    await verifier.end();
  }
  const signIn = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: "DrillPassword-2026!" }),
  });
  const cookie = (signIn.headers.getSetCookie?.() ?? [])
    .map((entry) => entry.split(";")[0])
    .join("; ");
  return { email, signUp, signIn, cookie };
}

function authed(cookie, extra = {}) {
  return {
    "content-type": "application/json",
    origin: BASE,
    cookie,
    "x-vercel-forwarded-for": "198.51.100.21",
    ...extra,
  };
}

async function drillBola() {
  const userA = await makeUser("bola-a", "198.51.100.20");
  const userB = await makeUser("bola-b", "198.51.100.21");
  const signedIn =
    userA.signUp.status === 200 &&
    userA.signIn.status === 200 &&
    userA.cookie.length > 0 &&
    userB.signIn.status === 200 &&
    userB.cookie.length > 0;
  record(
    "D10",
    "two QA accounts can sign up and sign in on the local server",
    "200 for both sign-up/sign-in, session cookie present",
    `A=${userA.signUp.status}/${userA.signIn.status} B=${userB.signIn.status} cookieLen=${userA.cookie.length}`,
    signedIn,
    "high",
  );
  if (!signedIn) return;

  const pub = await request("/api/publications", {
    method: "POST",
    headers: authed(userA.cookie),
    body: JSON.stringify({ name: `WP8 Drill Pub ${EMAIL_SUFFIX}` }),
  });
  const publication = pub.json;
  const post = await request("/api/posts", {
    method: "POST",
    headers: authed(userA.cookie),
    body: JSON.stringify({
      publicationId: publication?.id,
      slug: `wp8-drill-${EMAIL_SUFFIX}`,
    }),
  });
  const created = post.json;
  record(
    "D11",
    "owner can create a publication and a post",
    "201 for both",
    `pub=${pub.status} post=${post.status} id=${created?.id ?? "none"}`,
    pub.status === 201 && post.status === 201,
    "high",
  );
  if (!created?.id) return;

  const crossRead = await request(`/api/posts/${created.id}/draft`, {
    headers: authed(userB.cookie),
  });
  const crossWrite = await request(`/api/posts/${created.id}/draft`, {
    method: "PUT",
    headers: authed(userB.cookie),
    body: JSON.stringify({
      expectedVersion: 0,
      title: "Hijacked by B",
      bodyMarkdown: "Hijack",
    }),
  });
  const crossPub = await request(`/api/publications/${publication.id}`, {
    headers: authed(userB.cookie),
  });
  const blocked = [crossRead.status, crossWrite.status, crossPub.status].every(
    (status) => status === 403 || status === 404,
  );
  record(
    "D12",
    "cross-user draft read, draft write and publication read are denied",
    "403/404 for all three",
    `read=${crossRead.status} write=${crossWrite.status} publication=${crossPub.status}`,
    blocked,
    "high",
  );

  const exported = await request("/api/account/export", {
    headers: authed(userA.cookie),
  });
  record(
    "D13",
    "owner account export returns structured JSON",
    "200 with a JSON object",
    `${exported.status} ${exported.text.slice(0, 80)}`,
    exported.status === 200 && exported.json !== undefined,
    "medium",
  );

  const replay = await request(`/api/posts/${created.id}/draft`, {
    headers: authed("__Host-better-auth.session_token=replayed-token"),
  });
  record(
    "D14",
    "forged session token is refused",
    "401 or 403",
    `${replay.status} ${replay.text.slice(0, 100)}`,
    replay.status === 401 || replay.status === 403,
    "high",
  );
}

async function cleanup() {
  const client = new Client({ connectionString: DB });
  await client.connect();
  try {
    await client.query("BEGIN");
    const targets = await client.query(
      "select id::text as id from users where email like '%wp8drill%'",
    );
    const ids = targets.rows.map((row) => row.id);
    const rows = await client.query(
      "DELETE FROM rate_limit_counters WHERE key LIKE '%wp8drill%' OR key LIKE 'ip:198.51.100.%' OR key LIKE 'email:%example.test%' OR key LIKE 'email:%example.com%'",
    );
    const authRateRows = await client.query("DELETE FROM rate_limits");
    const users = await client.query("DELETE FROM users WHERE email LIKE '%wp8drill%'");
    await client.query("COMMIT");

    // Prove removal in both dimensions: rows that carry the drill email and
    // rows that reference a deleted drill user id.
    const checks = {};
    for (const table of [
      "users",
      "sessions",
      "accounts",
      "verifications",
      "posts",
      "publications",
      "audit_events",
      "rate_limit_counters",
      "rate_limits",
    ]) {
      const hasEmail = await client.query(
        "select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name='email'",
        [table],
      );
      const hasUserId = await client.query(
        "select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name='user_id'",
        [table],
      );
      let n = 0;
      if (table === "rate_limit_counters") {
        const count = await client.query("select count(*)::int as n from rate_limit_counters");
        n += count.rows[0].n;
      }
      if (table === "rate_limits") {
        const count = await client.query("select count(*)::int as n from rate_limits");
        n += count.rows[0].n;
      }
      if (hasEmail.rowCount > 0) {
        const count = await client.query(
          `select count(*)::int as n from ${table} where email like '%wp8drill%'`,
        );
        n += count.rows[0].n;
      }
      if (hasUserId.rowCount > 0 && ids.length > 0) {
        const count = await client.query(
          `select count(*)::int as n from ${table} where user_id = ANY($1::uuid[])`,
          [ids],
        );
        n += count.rows[0].n;
      }
      checks[table] = n;
    }
    console.log(
      JSON.stringify({
        id: "CLEAN",
        rateLimitCountersDeleted: rows.rowCount,
        authRateRowsDeleted: authRateRows.rowCount,
        usersDeleted: users.rowCount,
        remaining: checks,
        pass: Object.values(checks).every((n) => n === 0),
      }),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--cleanup")) {
  await cleanup();
  process.exit(0);
}

await drillHealth();
await drillRateLimitShape();
await drillSpoofedXff();
await drillClientIsolation();
await drillVerificationFailureShape();
await drillForeignOrigin();
await drillSearchProbes();
await drillOversizedBody();
await drillHeaders();
await drillBola();

const failed = results.filter((r) => !r.pass);
console.log(
  JSON.stringify({
    id: "SUMMARY",
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.map((r) => r.id),
  }),
);
process.exit(failed.length === 0 ? 0 : 1);
