# RED TEAM / FAILURE DRILL RECORD — WP8

**Unverified first.** Everything marked `PROVED` below was observed on this
machine against a local `next start` at `http://127.0.0.1:3100` and local
Postgres at `postgresql://postgres@localhost:55433/inkwellio` on 27 Nov 2026.
Nothing here was run against a deployed Vercel, Neon or Gmail account. Live
quota exhaustion, real SMTP outages and real platform WAF behaviour remain
`Unverified`.

## Scope and method

- Runner: `apps/web/tests/manual/red-team-drills.mjs` (17 drills, offline-safe,
  no external host). It prints one JSON line per drill and exits 1 on any
  failed expectation.
- Server: `npx next start -H 127.0.0.1 -p 3100`, `NODE_ENV=production`,
  `EMAIL_TRANSPORT=capture`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` supplied
  on the command line only. No secret is stored in a file or in this document.
- Database: local Postgres 18.3 on port 55433. QA rows use the suffix
  `wp8drill-<timestamp>@example.com`.
- Cleanup: `node apps/web/tests/manual/red-team-drills.mjs --cleanup` inside a
  transaction, then a row-count proof. See `docs/EVIDENCE.md`, E-006.

## Drill ledger

| ID | Hypothesis | Steps | Expected | Actual | Severity | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | The health probe answers without touching external services | `GET /api/health` | 200 | `200 {"status":"ok"}` | info | **PROVED** |
| D2 | Six auth attempts from one IP/identifier produce one 429 shape | 6 × `POST /api/auth/sign-up/email`, pinned `x-vercel-forwarded-for`, supplied `x-request-id` | `429`, `code=RATE_LIMITED`, `requestId`, `Retry-After` | Run 1: `403,403,403,403,403,429`; run 2: `429,429,429,429,429,429`. Refusal body `{"code":"RATE_LIMITED","status":429,"message":"Too many requests","requestId":"drill-rate-5"}`, `retry-after=473` | medium | **PROVED** |
| D3 | A rotating client `X-Forwarded-For` cannot reset the pinned bucket | 7 sign-ups, rotating `x-forwarded-for`, fixed platform header | attempts 6 and 7 are 429 | `429,429,429,429,429,429,429` | high | **PROVED** |
| D4 | A different caller is not locked out by the first caller's flood | sign-up from a different pinned IP and identifier | not 429 | `403 {"message":"Missing or null Origin","code":"MISSING_OR_NULL_ORIGIN"}` — refused by origin policy, not by the limiter | high | **PROVED** (no lockout) |
| D5 | A verification-email failure answers structured JSON | `POST /api/auth/send-verification-email` with no session | JSON, no empty 500, no stack | `200 {"status":true}` — Better Auth's anti-enumeration answer for an unknown address; no mail dispatched for a non-existent user | high | **PROVED** (shape), accepted risk below |
| D6 | A foreign origin is refused | `POST /api/auth/sign-in/email` with `Origin: https://evil.test` | 403 / `INVALID_ORIGIN` | `403 {"message":"Invalid origin","code":"INVALID_ORIGIN"}` | high | **PROVED** |
| D7-sql | SQL probe cannot reach the query builder | `GET /api/search?q=' OR 1=1 --` | JSON, no 5xx, no SQL leak | `200 application/json {"query":"' OR 1=1 --","items":[],"nextCursor":null}` | medium | **PROVED** |
| D7-xss | HTML-looking search input is not executable | `GET /api/search?q=<script>alert(1)</script>` | JSON content type, no 5xx | `200 application/json {"query":"<script>alert(1)</script>",...}`. The query is echoed as JSON data; `apps/web/src/app/search/page.tsx:146` renders it as `{results.query}` through React (escaped), and there is no `dangerouslySetInnerHTML` in that route. **The first version of this drill failed on the raw substring; the expectation was corrected to the security property (content type), with this evidence, not silently relaxed.** | medium | **PROVED** (no execution path) |
| D7-path | Path traversal in search does not read a file | `GET /api/search?q=../../etc/passwd` | JSON, no file content | `200 application/json`, empty items | medium | **PROVED** |
| D7-huge | Oversized query is rejected before DB access | `q` = 500 chars | 400 JSON | `400 {"error":{"code":"VALIDATION_ERROR",...,"message":"Search query must be 1-100 characters"}}` | medium | **PROVED** |
| D8 | Oversized anonymous write is refused without a 5xx | `POST /api/posts` with 2 MB body | 401/400/413 JSON | `401 {"code":"UNAUTHORIZED","message":"Sign in to continue","requestId":...}` | medium | **PROVED** |
| D9 | HTML CSP stays report-only while `/api/**` is enforced | `GET /privacy`, `GET /api/health` | report-only on HTML, enforced on API | HTML: `content-security-policy-report-only`; API: `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` | low | **PROVED** |
| D10 | Two QA users can sign up and sign in locally | sign-up, set `email_verified=true` directly in the local DB fixture, sign-in | 200 + session cookie | `A=200/200 B=200 cookieLen=112` | high | **PROVED** |
| D11 | An owner can create content | `POST /api/publications`, `POST /api/posts` with owner cookie | 201 for both | `pub=201 post=201 id=9e8068dc-9445-4a9b-b672-2cfcd52d9583` | high | **PROVED** |
| D12 | Cross-user reads and writes are denied (BOLA/BFLA) | user B reads A's draft, writes A's draft, reads A's publication | 403 or 404 for all | `read=404 write=403 publication=404` | high | **PROVED** |
| D13 | Owner export returns structured JSON | `GET /api/account/export` with A's cookie | 200 JSON object | `200 {"exportedAt":"2026-11-27T12:22:24.007Z","user":{"id":"4526b739-c5...` | medium | **PROVED** |
| D14 | A forged session token is refused | draft read with `session_token=replayed-token` | 401/403 | `401 {"code":"UNAUTHORIZED","message":"Sign in to continue","requestId":...}` | high | **PROVED** |

Final runner output: `{"id":"SUMMARY","total":17,"passed":17,"failed":[]}`.

## Findings and disposition

1. **Shared-bucket lockout (high, fixed in Milestone A).** Before the fix, a
   caller without a trusted platform IP fell into Better Auth's one
   `no-trusted-ip` bucket (3 requests/minute on sign-up), so one client could
   lock out every other. Evidence: `docs/handoffs/frontend-needs.md` §2.1. Fix:
   disable Better Auth's limiter, use trust-verdict IP resolution plus a
   per-identifier bucket and a high-cap global backstop. Retest: D3, D4, and
   `tests/wp8-fallbacks.test.ts` (9 tests).
2. **Non-uniform 429 and outage mislabelled as abuse (medium, fixed).** The old
   auth 429 had no `requestId` or `Retry-After`, and a counter-store failure
   returned 429. Fix: kernel `RATE_LIMITED` with `Retry-After`; store outage
   returns `503 UNAVAILABLE`. Retest: D2 and `tests/wp8-fallbacks.test.ts`.
3. **Empty-bodied 500 on email failure (high, fixed).** `mapAuthError` also
   mapped a rate-limit error to `UNAVAILABLE` because of a SQLSTATE hack.
   Fix: `EmailUnavailableError` (503) and a handler-level catch. Retest:
   `tests/email-transport.test.ts`, D5.
4. **Health-check pooled-client leak (high, fixed).** A timed-out query left a
   checked-out client unreleased; five leaks exhaust `max: 5`. Mutation proof:
   stashing the fixed route and rerunning `health.test.ts` produced
   `Tests  2 failed | 5 passed (7)` (`expected +0 to be 1`).
5. **Unauthenticated `send-verification-email` (accepted, not fixed).**
   Observed `200 {"status":true}` for an unknown address. This is Better
   Auth's anti-enumeration answer: identical response whether or not the
   address exists, and the app-level limiter caps it at 5/600 s. It is not a
   mail-delivery primitive for arbitrary addresses; no account is created.
   Retest: D5. **Unverified** whether an authenticated caller can use it to
   re-send to a third party without consent — out of scope for this local run.
6. **Raw query echoed in JSON (triaged, no code change).** See D7-xss. The
   response content type is `application/json` and the only consumer found
   renders through React. **Unverified** for any future client that renders
   this field as HTML.

## Tests and mutation proofs that back the fixes

| Fix | Permanent regression test | Mutation proof (fix removed) |
| --- | --- | --- |
| Health client release | `tests/health.test.ts` — "releases the pooled client when the query times out" and two companion cases | stash fixed route → `2 failed / 5 passed` |
| Store outage ≠ abuse | `tests/rate-limits.test.ts` — "fails closed on a store outage as 503, never as 429" | assertion is the inverse of the old test, which asserted 429 |
| 429 contract | `tests/wp8-fallbacks.test.ts` — "renders a 429 with code, message, requestId and Retry-After" | old handler returned only `{code,message}`, no `requestId`/header — the new assertion would fail on it |
| Origin allowlist | `tests/env.test.ts` — wildcard, bare host, path and ftp origins rejected | old env schema had no field at all — the test would fail to parse |
| Email outage contract | `tests/email-transport.test.ts` — `code: "UNAVAILABLE"` on missing credentials and SMTP timeout | old code threw a plain `Error` with a different message |
| Route guard matrix | `tests/route-inventory.test.ts` — public allow-list and guard checks | flipping `posts/policy.ts` to `public` → `1 failed / 8 passed` |

## What was NOT drilled

- Real Neon quota exhaustion, PITR restore, real Gmail 500/day saturation,
  real secret rotation, external uptime monitoring, live WAF rule behaviour.
- Multi-region failover and edge caching: the deployment is single-region.
- The account-erasure confirm path over HTTP (the token is held in the
  server-process capturing transport, which a black-box client cannot read).
  It is covered by `tests/db/full-backend-e2e.test.ts` Journey 5 against local
  Postgres, not by this live-server run.
- 20+ parallel sign-ups / conflicting drafts. `tests/db/wp8-concurrency-and-loaders.test.ts`
  (5 tests) covers concurrency at the service layer; a live parallel flood
  was not run in this session.
