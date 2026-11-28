# EVIDENCE LEDGER — WP8 BREAK + RAISE

**Unverified.** Every entry below names the exact command or file that produced
it. Claims without a command or `file:line` are not evidence and are not made
here. Live-provider behaviour is `Unverified`.

## A. Commits and scope

| ID | Command / source | Trimmed result |
| --- | --- | --- |
| E-001 | `git log -n 3 --oneline` | `c821d5d test(routes): enforce the API guard matrix and pin fallback behaviour`; `59bc30a fix(identity): close the three logged backend defects plus the health-check client leak`; `28914a5 Merge pull request #35 ...` |
| E-002 | `git diff --name-only origin/main..HEAD` | checked in Milestone D; must contain only `apps/web/src/{kernel,modules,app/api}/**`, `apps/web/tests/**`, `docs/**` |
| E-003 | `git status --short` at handoff | 9 modified files, no untracked secret or dependency file |

## B. Fixed defects

| ID | Source | Evidence |
| --- | --- | --- |
| E-010 | `apps/web/src/modules/identity/index.ts:74` | `trustedOrigins: Array.from(new Set([baseURL, ...(env.BETTER_AUTH_TRUSTED_ORIGINS ?? [])]))` — was `[baseURL]` |
| E-011 | `apps/web/src/modules/identity/index.ts:183` | `rateLimit: { enabled: false }` with the reason recorded in the comment; Better Auth's shared `no-trusted-ip` bucket can no longer answer before the app limiter |
| E-012 | `apps/web/src/modules/identity/limiter.ts:74-130` | `resolveClientIp` returns `{trusted, ip, source}`; `x-forwarded-for` used only when `TRUST_PROXY_HEADERS=1` |
| E-013 | `apps/web/src/modules/identity/limiter.ts:154-210, 264-360` | per-IP or global-backstop dimension plus per-email dimension; store outage returns `status: 503, reason: "store_unavailable"` |
| E-014 | `apps/web/src/kernel/errors.ts:147-154` | `RateLimitError` carries `retryAfterSeconds`, clamped to ≥ 1 |
| E-015 | `apps/web/src/app/api/_lib/respond.ts:73-78` | 429 response sets `retry-after` and keeps `requestId` in the body |
| E-016 | `apps/web/src/modules/identity/email.ts:131-135, 152-175` | missing credentials and SMTP failure both throw `EmailUnavailableError` (`UNAVAILABLE`, 503) with no credential/recipient/token in the log |
| E-017 | `apps/web/src/modules/identity/email.ts:196-238` | `EMAIL_TRANSPORT` selects `auto`/`smtp`/`capture`; capture logs `email_transport_capture_mode` once; `isEmailTransportReady` refuses email-only routes when SMTP is configured without credentials |
| E-018 | `apps/web/src/app/api/health/route.ts:14-45` | client acquired first, `client.release()` in `finally`, pool injectable for tests |
| E-019 | `apps/web/src/kernel/env.ts` | `BETTER_AUTH_TRUSTED_ORIGINS` parsed to ≤ 10 absolute http(s) origins with no `*` and no path/query/hash |

## C. Quality gate

| ID | Command | Trimmed result |
| --- | --- | --- |
| E-020 | `REQUIRE_DB=1 DATABASE_URL=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=... pnpm check` (Milestone A) | `gate: lint`, `gate: typecheck`, `gate: build`, `gate: test`, `gate: boundaries`; `Test Files  58 passed (58)`, `Tests  584 passed (584)`; `✔ no dependency violations found (176 modules, 333 dependencies cruised)`; exit 0 |
| E-021 | same command (Milestone B) | `Test Files  59 passed (59)`, `Tests  598 passed (598)`, all five steps green |
| E-022 | `git push` after Milestone B | `59bc30a..c821d5d wp8-backend-break-resilience -> wp8-backend-break-resilience` |

## D. Live drills

| ID | Command | Trimmed result |
| --- | --- | --- |
| E-004 | `node apps/web/tests/manual/red-team-drills.mjs` (first run) | `{"id":"SUMMARY","total":12,"passed":11,"failed":["D7-xss"]}` — the failure was an over-broad substring check on JSON; triaged in `docs/RED_TEAM.md` D7-xss |
| E-005 | `node apps/web/tests/manual/red-team-drills.mjs` (final run) | `{"id":"SUMMARY","total":17,"passed":17,"failed":[]}` |
| E-006 | `node apps/web/tests/manual/red-team-drills.mjs --cleanup` | `{"id":"CLEAN","rateLimitCountersDeleted":28,"authRateRowsDeleted":0,"usersDeleted":0,"remaining":{"users":0,"sessions":0,"accounts":0,"verifications":0,"posts":0,"publications":0,"audit_events":0,"rate_limit_counters":0,"rate_limits":0},"pass":true}` |
| E-007 | `node apps/web/tests/manual/db-count.mjs` after cleanup | `wp8drill users: 0` |
| E-008 | post-gate cleanup (the DB-enabled gate creates counter rows again) | `rateLimitCountersDeleted: 11`, all `remaining` values `0`, `pass: true` |

All drill rows (hypothesis, steps, expected, actual, severity, disposition) are
in `docs/RED_TEAM.md`. No external host was contacted.

## E. Mutation proofs

| ID | Command | Result |
| --- | --- | --- |
| E-030 | `git stash push -- apps/web/src/app/api/health/route.ts`, then `vitest run apps/web/tests/health.test.ts`, then `git stash pop` | `AssertionError: expected +0 to be 1`; `Tests  2 failed | 5 passed (7)` |
| E-031 | set `posts/policy.ts` to `public`, run `vitest run apps/web/tests/route-inventory.test.ts`, then `git checkout --` that file | `AssertionError: expected [...5 public routes] to deeply equal [...4]`; `Tests  1 failed | 8 passed (9)` |
| E-032 | baseline comparison: stash all work, run the three build/server-dependent suites | same 3 failures as with the work applied, proving they need a built app rather than being regressions |

## F. Honest self-score (0–3)

| Dimension | Score | Why not higher |
| --- | --- | --- |
| Security | 2 | BOLA/BFLA, origin, session replay and injection probes passed on a local server (D6, D12, D14, D7). But no external pentest, no live CSP enforcement on HTML (report-only by design), and the account-erasure HTTP path was not drilled live. |
| Data integrity | 2 | 598 automated tests on real Postgres, including compare-and-set drafts and BOLA, passed. No live 20-way race or restore-from-backup drill was run. |
| Reliability / fallbacks | 2 | Health client leak fixed with mutation proof; bounded email timeouts and 503 contracts pinned. The database remains a single point of failure and no live provider outage was simulated. |
| Abuse / rate limiting | 2 | Per-IP/per-identifier limits, uniform 429 shape and spoof resistance proved locally (D2, D3, E-013). Per-write limiting exists in code but is not wired; no live WAF or distributed-load test. |

**Three strongest reasons this score may be too generous**

1. The live drills used a local server and a local database with fixture rows
   verified directly in SQL. A deployed environment has a different proxy
   chain, so the "trusted IP" verdict for `x-real-ip` depends on a deployment
   flag (`TRUST_PROXY_HEADERS`) that has not been exercised in production.
2. The route guard matrix is a source-code assertion, not a runtime policy
   enforcement point. A handler that declares `authenticated` but forgets to
   call the guard would pass `policy.ts` checks only if the scanner also found
   no guard — but a future refactor to a new helper name would evade the
   current regex patterns.
3. The 598-test gate proves the tested paths, not the untested ones. Several
   rows in `docs/FAILURE_MODES.md` still say `Proved = no` for live provider
   events; those are exactly the failures most likely to hurt a free-tier T2
   deployment.

**Free-tier / single-region limits (accepted, not solved)**

- One Neon compute in one region, 100 CU-hours/month and 1 GB storage: quota
  exhaustion takes the whole application down; no cross-region failover.
- One Vercel Hobby project with one WAF rate-limit rule and a 300 s function
  cap; platform-level abuse protection is not under our control.
- Gmail ~500 messages/day and one app password: verification is a hard gate,
  so an SMTP outage stops sign-ups by design.
- One developer, 6-hour documented recovery window, no independent pentest.

## G. 15-minute manual check for Richard

1. `cd .worktrees/wp8-backend && pnpm check` with the four env vars above.
   Expect five green gate steps and `598 passed` (about 5 minutes).
2. Start a local server: `NODE_ENV=production EMAIL_TRANSPORT=capture ... npx next start -H 127.0.0.1 -p 3100`.
   `curl -i http://127.0.0.1:3100/api/health` → 200 `{"status":"ok"}`.
3. `node apps/web/tests/manual/red-team-drills.mjs` → summary
   `17 passed, 0 failed`. Then `node apps/web/tests/manual/red-team-drills.mjs --cleanup`
   → `remaining` all zero.
4. To see the old defects return, stash `apps/web/src/app/api/health/route.ts`
   and run `vitest run apps/web/tests/health.test.ts`: expect 2 failures.

## H. Pull request

PR: https://github.com/hiamrhex/Inkwellio/pull/36

`gh pr checks 36` (exit 0):

```
Check                 pass  1m43s  .../actions/runs/45999604514/job/140507570934
Check                 pass  2m6s   .../actions/runs/45999669065/job/140507792884
Lighthouse CI         pass  6s     .../actions/runs/45999604514/job/140508389991
Lighthouse CI         pass  5s     .../actions/runs/45999669065/job/140508794455
Vercel                pass  0      Deployment has completed
Vercel Preview Comments pass 0
```

`git diff --name-only origin/main..HEAD` listed 19 files: 8 under
`apps/web/src/{kernel,modules,app/api}`, 8 under `apps/web/tests/**`, 3 under
`docs/**`. Zero forbidden UI, dependency, `package.json` or lockfile changes.

## I. WP8 write-limits follow-up (branch `wp8-write-limits`)

**Unverified.** Local `next start` on `127.0.0.1:3101` and local Postgres on
55433 only. No deployed service was contacted.

| ID | Command / source | Trimmed result |
| --- | --- | --- |
| E-040 | `pnpm check` with the four env vars on the command line | lint, typecheck, build, `Test Files 61 passed (61)`, `Tests 611 passed (611)`, boundaries green; `✔ no dependency violations found (177 modules, 343 dependencies cruised)` |
| E-041 | `vitest run apps/web/tests/wp8-write-limits.test.ts` | `Test Files 1 passed`, `Tests 7 passed` — 40-save burst allowed, 121st draft save 429, 31st structural write 429, separate action buckets, store outage 503, route-level 429/503 before service |
| E-042 | remove the `enforceWriteLimit` line from `posts/[id]/draft/route.ts`, run the same test, restore | `Tests  2 failed | 5 passed (7)`: `expected 200 to be 429` and `expected 200 to be 503` |
| E-043 | `vitest run apps/web/tests/wp8-identity-body.test.ts` | `Tests 6 passed` — malformed JSON, array, primitive and `null` all rejected with `VALIDATION_ERROR` and fixed message |
| E-044 | replace `readIdentityJsonObject` with a bare `request.json()`, run the same test, restore | `Tests  5 failed | 1 passed (6)` |
| E-045 | `DRILL_BASE_URL=http://127.0.0.1:3101 node apps/web/tests/manual/red-team-drills.mjs` | `{"total":17,"passed":17,"failed":[]}`; D4: `A=429,429,429,429,429,429 B=200 {"token":null,"user":{...}}` |
| E-046 | `node apps/web/tests/manual/red-team-drills.mjs --cleanup` | `rateLimitCountersDeleted:33`, `usersDeleted:3`, all `remaining` values `0`, `pass:true` |
| E-047 | `node apps/web/tests/manual/db-count.mjs` after cleanup | `wp8drill users: 0` |
| E-048 | `git diff --name-only origin/main..HEAD` | checked before PR creation; must contain no UI, `package.json` or lockfile changes |
| E-049 | post-gate cleanup (DB-enabled tests recreate counters) | `rateLimitCountersDeleted:40`, all `remaining` values `0`, `pass:true` |

The Phase 2 contract note is `docs/handoffs/phase2-api-ready.md`; it records
that `/history` has neither a screen nor a revisions/trash API route on this
branch, so that contract remains `Unverified`.

## J. Vercel background-email lifecycle fix (same PR)

| ID | Command / source | Trimmed result |
| --- | --- | --- |
| E-050 | `apps/web/src/modules/identity/index.ts:356-366` | `trackIdentityBackgroundTask` attaches the redacting rejection handler, registers `after(() => tracked)`, and falls back to `void tracked` when no request scope exists; the Better Auth handler at line 208 calls it |
| E-051 | `vitest run apps/web/tests/wp8-background-tasks.test.ts` | `Tests 3 passed` — platform callback registered and awaited, rejection logged as `{error:"Error"}` with no token/address/password in the log, and no throw when `after` throws |
| E-052 | disable the `after(...)` registration in that helper, rerun, restore | `Tests 2 failed | 1 passed (3)` (`expected [] to have a length of 1 but got +0`) |
| E-053 | `pnpm check` after the fix | lint, typecheck, build, `Test Files 62 passed (62)`, `Tests 614 passed (614)`, boundaries green |
| E-054 | post-gate cleanup | `rateLimitCountersDeleted:94`, all `remaining` values `0`, `pass:true` |

## K. WP7 Wave B frontend completion (branch `wp7-wave-b`)

**Unverified.** Local `next start` on `127.0.0.1`, local PostgreSQL 18 on `55433`, and `EMAIL_TRANSPORT=capture` only. No deployed production host or live Gmail SMTP transport was contacted, and `/history` stays unimplemented per `docs/handoffs/phase2-api-ready.md` (no revisions/trash backend endpoint).

| ID | Command / source | Trimmed result |
| --- | --- | --- |
| E-060 | `REQUIRE_DB=1 DATABASE_URL=postgresql://postgres@localhost:55433/inkwellio BETTER_AUTH_SECRET=... BETTER_AUTH_URL=http://127.0.0.1:3102 pnpm check` | `lint`, `typecheck`, `build` (30 routes incl. `/dashboard`, `/studio/[postId]`, `/settings/privacy`), `Test Files 63 passed (63)`, `Tests 622 passed (622)`, boundaries clean (`✔ no dependency violations found (180 modules, 348 dependencies cruised)`) |
| E-061 | `node apps/web/tests/verify/phase2-cdp.mjs` (production `next start` + headless Chrome + local Postgres 18) | `SUMMARY: 0 FAILURES`: anonymous redirects (`/dashboard`, `/studio/[postId]`, `/settings/privacy`), sign-up -> verify -> `/dashboard`, live `@handle` URL preview, `/studio/[postId]` draft save/XSS-escape Preview/topics/slug, real `409 Conflict` (`Copy my text` + `Reload latest draft`), `429 Retry-After` cooldown & `503` non-JSON recovery (`Retry save`), Trash/Restore/Publish inside `/dashboard`, anonymous reader (`/@handle/slug`, `/topics/tactics`, `/search`), `/settings/privacy` JSON export & 2-step erasure, 1440px/390px `overflowPx: 0`, `CLS: 0`, `0` page errors, `0` third-party requests, `remainingQaUsers: 0` |
| E-062 | `apps/web/tests/wp7-wave-b.test.ts` + `apps/web/tests/db/wp8-concurrency-and-loaders.test.ts` | Layer 64 `Retry-After`/`413`/`503` formatting, `SiteShell` `workspaceNav` + non-placeholder footer, `/dashboard` live preview + `Publish`/`Unpublish`/Trash, `StudioEditor` shortcuts/`beforeunload`/`409` copy, `/settings/privacy` policy + `loadSettingsData` user isolation |
| E-063 | `git diff --name-only origin/main..HEAD` | frontend, test, and docs files only; zero modifications under `apps/web/src/{modules,kernel,app/api}/**`, `package.json`, or `pnpm-lock.yaml` |
