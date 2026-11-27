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
