# Design amendments

Owner-approved changes to the design doc, 18 November 2026. Notes only, no code.
These override the corresponding sections of `Blog Platform Architecture and System Design.md`.

## Triage of the design audit

`design-audit-2026-11-18.md` arrived on 19 November. Its ten top gaps map as follows; nothing is
answered by intention alone, only by a decision with a check.

| Audit gap | Status | Where |
| --- | --- | --- |
| 1 Privacy: export, erasure, inventory, terms | Settled | A6, ADR-014 |
| 2 No security logging, logs last 1 h | Settled | **A10** |
| 3 Email provider undecided | Settled, one unknown | A4 (Gmail SMTP), U-3 (SMTP egress) |
| 4 Silent lost updates | Settled | A7, ADR-007 |
| 5 Limits, other render surfaces | Settled | A8 |
| 6 Environments, region | Settled | A9, ADR-013 |
| 7 Timeouts, retries, idempotency | Settled | A9 |
| 8 No SLIs, no capacity test | Settled | **A11** |
| 9 Admin and project governance | Partly settled | **A12**, A10 (admin actions audited); moderation stays out of v1 |
| 10 Browser security headers, open redirect | Settled, one gap named | **A13** |

Quick wins: 1–4 were already A6/A8/A7/A9. 5 is now in ADR-007 (post lifecycle). 6 is
`adr/README.md` (every ADR has a falsifier and a revisit date). 7 is A12 plus `SECURITY.md`.

Accepted rather than fixed: circuit breakers (one dependency; the retry and timeout policy in A9 is
the control), delivery metrics (a solo project has no team to manage), release management (no
versioned artifact; `main` is the release), and a third-party error tracker (a new data processor and
a new SPOF for 1 h of logs — A10 makes the durable record a database row instead).

## A1. Neon compute, not storage, is the binding constraint

Neon free = **100 CU-hours per project per month** (≈ 400 hours at 0.25 CU). Hitting it **suspends compute**;
existing connections drop and new connections cannot open until the next billing period or an upgrade.
So the failure is a total outage, not "writes fail".

**Public page caching moves earlier, next to WP1/WP4.** It is an availability control, not a Lighthouse
optimisation, and it is the only thing keeping the project on the free tier.
Source: `neon.com/faqs/free-plan-limits-and-quotas` (E-007, E-008).

## A2. Autosave does not create revisions

Autosave writes to a **mutable `draft_state` row** (one per post). **`post_revisions` stays append-only** and
is written only on explicit save or on publish. This keeps "history is immutable" true, keeps autosave off
live content, and keeps storage proportional to editorial events rather than keystrokes.
`draft_state` also carries `base_revision_id`, which is what makes concurrent-edit detection possible.

## A3. Auth IP source must be pinned, and the test must spoof

Better Auth reads `x-forwarded-for` by default. On plain Vercel that default is **safe**, because Vercel
overwrites the header and does not forward external IPs, explicitly to prevent spoofing (E-015).
The risk returns the moment anything sits in front of Vercel.

**WP2 sets `ipAddressHeaders: ['x-vercel-forwarded-for']`** — documented as identical to `x-forwarded-for`
but not overwritten when a proxy is in front — and the brute-force test **rotates the header** to prove the
limiter does not move.

Correction of record: my earlier review said the default was spoofable on Vercel. That was wrong; the
correct statement is in this section.

## A4. Email: Gmail SMTP with an app password

Transport: Gmail SMTP via nodemailer, app password (2FA required on the account), **~500 recipients/day**.
Because the external ceiling is small and invisible to users, OTP and verification requests are rate limited
**per email address and per IP**, and the transport sits behind one interface so it can be swapped without
touching identity code.

Unverified and load-bearing: whether Vercel Functions permit outbound SMTP on 587/465 at all (U-3). Test
before building on it; if blocked, the interface is the escape hatch.

## A5. Hosting is portable, and the terms question is open

Vercel Hobby's terms say "personal or non-commercial use" and reserve the right to remove projects without
notice, including for performance problems caused by malicious attack (E-009). Whether a public multi-user
publishing service is "personal" is **not settled**, and Mr Tobi's answer is still pending.

Until it is answered: keep the deploy portable — no platform-only APIs, standard environment variables,
Node-runnable app, documented migration path off Vercel — and keep signups closed to invited writers.

## A6. Privacy is v1 scope: export, erasure, inventory, terms

**Decision.** v1 ships **data export**, **account erasure**, a published **data inventory**, and **terms of
use**. This is not a compliance afterthought: the product promises "I never lose it", and the matching
promise — "I can take it and leave" — is what makes ownership credible. NDPA 2023 duties are why it cannot
be deferred past public signup.

- **Export.** `GET /api/account/export`, authenticated and rate limited to 1 per hour, returns one
  `application/json` document with `Content-Disposition: attachment`: account record, publication, every
  post with status and timestamps, every revision in order (title + Markdown + created_at), the current
  `draft_state` so unsaved work is included, slug history, and topic assignments. JSON, not a zip: no new
  dependency, and a Markdown-file bundle can be added later without changing the contract. Cap 25 MB; above
  that the response is `413` with the support address from `/privacy`.
- **Erasure.** `DELETE /api/account` requires password re-entry and a single-use token emailed to the
  account address (15-minute TTL). On confirmation one transaction hard-deletes the user and everything
  cascading from it: publication, posts, revisions, `draft_state`, slug history, post-topic links, sessions,
  accounts, verifications, and rate-limit rows keyed by the account's email. IP-keyed limiter rows cannot be
  attributed to one account; they expire after 24 hours instead. The deletion screen offers the export first. **No grace period**: Hobby cron runs at most once a day (±59 min), so a grace period
  promises "deleted" while the data is still present, and adds a pending-deletion state to get wrong.
- **Erasure is the one exception to append-only.** `post_revisions` stays immutable while the account
  exists; erasure removes the whole set. ADR-007's rule becomes "never updated, and deleted only by account
  erasure". Audit rows about the account are deleted with it; rows where the user was the actor keep the
  action but lose the actor id.
- **Residue is bounded and stated.** Deletion purges cache tags, but a CDN copy may survive until the page's
  `cacheLife` maximum (≤ 1 hour, A9). Neon's 6-hour PITR window and the weekly logical dump can contain the
  rows until they age out (≤ 7 days); they are restored only for disaster recovery, never to resurrect one
  account. `/privacy` says this in plain language.
- **Inventory.** `/privacy` lists each category (account, content, technical), why it is held, where (Neon,
  Vercel, Gmail), and for how long: rate-limit rows 24 h, audit log 90 days, platform logs 1 h, content until
  erasure. No analytics, third-party scripts, or ad tech in v1; if that changes, the inventory changes first.
- **Terms.** `/terms` from v1: the author retains copyright and grants a licence to host and display,
  acceptable use, takedown, termination, 18+.
- **Verification.** WP1 includes an erasure test that deletes a fixture account, then scans a named table
  list for the user id, email, publication slug, and a hash of each post body. Adding a table without adding
  it to that list fails review. WP2 proves the token flow; WP6 ships the two screens.
- Not legal advice: a lawyer reviews the two pages before public signup, not before WP1.

## A7. Every draft write is compare-and-set on a monotonic version

**Decision.** `draft_state` carries `version integer NOT NULL DEFAULT 0`. Every accepted write — autosave,
explicit save, publish — sends `expected_version`, and the write is
`UPDATE draft_state SET ..., version = version + 1 WHERE post_id = $1 AND version = $2 RETURNING version`
in the same transaction as any revision insert. Zero rows updated means conflict. A post with no
`draft_state` row starts at `version = 0` in the transaction that creates the post.

- The CAS token is **`version`, not `base_revision_id`**. Two autosaves can share a base revision, so the
  base alone cannot detect the second writer. This sharpens A2's wording; `base_revision_id` stays as the
  link from a draft to the revision it was built on.
- A conflict is a normal result: `409` with `{ code: "draft_conflict", currentVersion, currentTitle,
  currentBodyMarkdown, updatedAt }`, owner-only, capped by the body limit in A8. Never a 500, never silent
  last-write-wins.
- Autosave **stops** on conflict. The tab shows a non-dismissable notice, blocks further autosaves, and
  offers reload or copy. No automatic merge in v1; merging is a later feature with its own design.
- Publish uses the same token, so a stale tab cannot publish text it never saw.
- The client keeps one in-flight write per post; the server relies on the token, not on client timing.
- Tests (WP1 and WP3): the same `expected_version` twice → one success and one conflict; 50 parallel
  autosaves → one winner and `version + 1`; save then publish from a stale tab → conflict; a conflict
  payload contains only the owner's data (authorization runs first); `version` never decreases.
- Conflicts are never retried automatically: the same token must fail again, and a refreshed token would
  overwrite text the user has not seen.

## A8. Inputs have limits; every output surface encodes

**Decision.** Limits exist at three layers — HTTP body, Zod, database `CHECK` — and every surface that
renders a user string is named with its encoding.

| Field | Limit | Enforced by |
| --- | --- | --- |
| HTTP request body | 256 KiB | route/action boundary; Next `serverActions.bodySizeLimit` set explicitly |
| `post_revisions.title` / `draft_state.title` | 1–200 chars, no CR/LF | Zod + `char_length` CHECK on both |
| `post_revisions.body_markdown` / `draft_state.body_markdown` | 1–100 KiB (102,400 bytes UTF-8) | Zod + `octet_length` CHECK on both |
| `posts.slug` / `publications.slug` | 1–64, `[a-z0-9-]`, no leading/trailing/double hyphen | Zod + CHECK + reserved list |
| publication name | 1–80 chars | Zod + CHECK |
| publication bio | ≤ 500 chars, plain text, not Markdown | Zod + CHECK |
| topic name | 1–40 chars | Zod + CHECK |
| any other string | ≤ 2,000 chars | Zod |

- 100 KiB of Markdown is roughly 17,000 words. It is chosen so worst-case JSON escaping (~2×) still fits the
  256 KiB body cap. The database checks exist because migrations and scripts bypass Zod.
- Reserved publication slugs: `api, admin, login, sign-in, sign-up, settings, new, edit, topics, search,
  about, privacy, terms, rss, sitemap, health, _next`.
- Output surfaces and their encoding:
  - `<title>` and meta description — `generateMetadata` string fields, React text.
  - OpenGraph and Twitter tags — Next's metadata API attributes; never hand-built `<meta>`.
  - RSS and sitemap — XML-escape `& < > " '` on every interpolated value. A unit test feeds
    `</title><script>alert(1)</script>` and asserts the raw sequence never appears in the feed.
  - JSON-LD, if added — `JSON.stringify`, then escape `<`, `>`, `&` as `\u003c`, `\u003e`, `\u0026`.
  - Admin screens — titles rendered as text, same React escaping.
  - Links — the slug charset already prevents URL injection; construct with `encodeURIComponent` anyway.
- `react/no-danger: "error"` in ESLint, with a test that a fixture using `dangerouslySetInnerHTML` fails the
  shipped config. PLAN named this in WP0; it was not actually wired, so it is fixed with the rest of A8.
- Browser-side `maxlength` is a courtesy, never a control: every limit is enforced on the server.

## A9. One region, bounded calls, retry-safe writes

**Decision.** Colocate compute and data in one region, put a number on every outbound call, and make every
mutation safe to repeat.

- **Region.** Vercel Hobby allows a **single** function region (default `iad1`). Functions pin to `lhr1`
  (London, AWS `eu-west-2`) and the Neon project is created in `aws-eu-west-2` (London): the same AWS region,
  the closest pair for a Lagos/UK audience. Neon fixes a project's region at creation, so changing it later
  is a new project and a migration.
- **No long-lived staging.** Preview deployments use a Neon branch created schema-only from `main`;
  migrations run there before production. CI integration tests use the local Docker Postgres container, so
  CI holds no Neon credential. Production data never enters a branch.
- **Timeouts.** Request budget ≤ 30 s. Inner limits: connect 5 s, statement 15 s, email send 10 s, cache fill
  15 s. No path may rely on the platform's 300 s maximum. A timeout returns the standard error shape; it
  never becomes a hang.
- **Retries.** Exactly one retry, at the DB layer only, on connection errors, 250 ms base with jitter. No
  retry on statement errors, timeouts, or validation failures. Writes are never retried blindly.
- **Idempotent by construction.** Publish carries `expected_version` (A7), and publishing an
  already-published revision is a no-op success, so a retried publish cannot duplicate revisions or move
  `published_at`. Publication creation stays `INSERT ... ON CONFLICT (owner_id) DO NOTHING`. OTP send is
  keyed by (email, purpose, 60 s window); a resend invalidates the previous token.
- **Cache ages are part of the failure policy.** Published post: revalidate 60 s, expire 1 h. Feeds: 60 s /
  5 min. `updateTag` on publish and erasure. This is the A1 availability control, and it bounds how long a
  deleted page can still be served (A6).
- **Environment policy.** Required: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; identity also
  requires `GMAIL_*`. Secrets are per-environment and never shared between preview and production. Preview
  builds cannot email non-allowlisted addresses; one real verification email from a preview is the WP2 stop
  gate (U-3).
- **Verification.** WP4 injects 10 s of DB latency and asserts the timeout shape. WP1 asserts the retry
  wrapper is the only retry in the codebase. WP8 records the region pair and preview-branch settings.

## A10. Security events are rows, not log lines

**Decision.** Audit events are written to Postgres, in the same transaction as the action they record.
Hobby keeps one hour of runtime logs (E-004); a record that disappears in an hour cannot answer "who
published, deleted, or tried to sign in as this account on Tuesday". No third-party error tracker in
v1: it would be a new data processor and a new single point of failure, and it would still not be the
system of record.

- **Table** (WP1): `audit_events(id, occurred_at timestamptz, action text, outcome text CHECK in
  ('ok','denied','failed'), actor_kind text CHECK in ('user','admin','system','anonymous'),
  actor_user_id uuid NULL, subject_user_id uuid NULL, target_type text NULL, target_id text NULL,
  request_id text NOT NULL, ip_hash text NULL, metadata jsonb DEFAULT '{}')`. Indexed on
  `occurred_at`, `(actor_user_id, occurred_at)` and `(action, occurred_at)`.
- **The audit write is part of the transaction.** If the insert fails, the action fails. This adds no
  new failure mode: every authenticated write already needs the database, so an audit row cannot be
  the thing that makes the database unavailable. Do not "best effort" this — a failed login attempt
  that leaves no row is exactly the gap the audit exists to close.
- **Erasure.** `actor_user_id` and `subject_user_id` are `ON DELETE SET NULL`; rows whose *subject* is
  the erased account are deleted by the erasure transaction (A6, ADR-014). Rows where the user was the
  actor survive without the id — "an account was erased at 14:02 by request 7f2c" stays true without
  naming anyone.
- **Never recorded:** tokens, passwords, session ids, `Authorization` or `Cookie` values, Markdown
  bodies, or a plaintext email address. Anonymous auth events carry `ip_hash = sha256(ip +
  AUDIT_PEPPER)` and an `email_hash` in `metadata`, so brute force against one address is visible
  without storing the address. `metadata` is capped at 1 KiB serialised and never holds user text.
- **Recorded:** sign-in success and failure, sign-out, password reset request and completion, email
  verification, session revocation, role change, publication create, publish and unpublish, post
  soft-delete and restore, export, erasure request and confirmation, and a rate-limit trip.
- **Aggregation, not firehose.** Repeated failures collapse into one bucket row per `(action,
  ip_hash, 10-minute window)` with `metadata.attempts`. An attacker must not be able to make the
  audit table the outage. Autosave is never audited: it is not a security event, and A7 already
  records the outcome in `draft_state.version`.
- **Request id.** Generated in `proxy.ts`, echoed as `x-request-id`, stored on every audit row, and
  printed on the error page for any 5xx. One key joins a user's report, the one-hour log, and the
  durable row.
- **Retention.** 90 days, deleted by the daily cron. `/privacy` states it (A6). Errors are structured
  JSON on stdout with the same request id — useful for one hour, never the record.
- **Verification** (WP1, WP2): five failed sign-ins produce one aggregated row and no plaintext email
  anywhere in the table; a source scan of every `console.*` call site is checked against the
  forbidden-key list; a 5xx response carries `x-request-id`; the erasure test asserts the account's
  audit rows are gone and surviving actor columns are null.

## A11. Three service levels that the free tier can actually measure

**Decision.** Measure availability, latency and publish success with mechanisms that already exist —
no paid vendor, no dashboard nobody reads.

| SLI | How it is measured | Target |
| --- | --- | --- |
| Availability | scheduled GitHub Actions probe of `GET /api/health` (process up, `SELECT 1` under 5 s) every 15 min, run archived as a workflow artifact | **99.0 %** per calendar month (≈ 7 h of allowed downtime) |
| Latency | `Server-Timing: db;dur=…, total;dur=…` on HTML responses; the same probe samples five post pages and writes the timings into the run summary | p95 uncached < **800 ms** |
| Publish success | `audit_events` rows for `post.publish`: 5xx outcome over attempts. A compare-and-set conflict is a normal result, not a failure | **99.5 %** |

- 99.0 % is the honest number while Neon compute can be suspended by the quota (A1) and there is one
  region and one provider. WP4 raises it once caching proves reads survive with the database asleep;
  the target changes in the same commit that changes the measurement, never before.
- **Alerting is the failing probe.** A red scheduled workflow emails the owner; Neon and Vercel send
  their own quota and deploy mail. No pager, because there is nobody to page. Recorded as an accepted
  gap, not an oversight.
- **Error budget rule.** Burn half the month's budget inside one week: feature work stops until the
  cause is fixed and written into `FAILURE_MODES.md`. Solo means this is a rule to oneself, which is
  exactly why it is written down.
- **Capacity is a number to be found, not asserted.** Before any writer is invited (WP4 gate), one
  recorded baseline against a preview with seeded content: 50 requests/second for five minutes,
  report p95, error rate, cache hit ratio and the first resource to saturate — function concurrency,
  Neon CU, or the cache. The load estimate in the design is arithmetic; this replaces it.
- **Degradation matrix** (the layer-39 answer): database down → cached public reads serve until
  `cacheLife` expires (≤ 1 h), every write and every sign-in returns 503 with `Retry-After`;
  cache down → reads fall through to the database, slower and more expensive, never wrong; rate-limit
  store down → fail closed for authentication and OTP, fail open for cached public reads.
- **Known gap, named.** GitHub disables scheduled workflows after 60 days without repository
  activity, so monitoring stops when nothing is shipping. That is acceptable at this size and is
  written here rather than discovered during an incident.

## A12. Governance the repository can enforce

**Decision.** Four controls, all free, all recorded in one checklist rather than trusted to memory.

- **`SECURITY.md` at the root**, published now: private vulnerability reporting through GitHub
  advisories (E-027), 72-hour acknowledgement, seven-day triage verdict, scope, safe harbour, and an
  explicit "no bounty". The repository setting that turns reports on is a launch-checklist item.
- **Branch protection on `main`:** block force pushes and deletions, apply the rule to admins, and
  mark the CI job as a required status check. Pull-request review is **not** required: with one
  committer, self-approval is theatre. The binding rule stays the one in `AGENTS.md` — every commit
  is pushed and its CI run is watched before the next commit lands.
- **MFA everywhere, with a dated record:** GitHub, Vercel, Neon, and the Gmail account that holds the
  SMTP app password (A4 already requires 2FA there). Recovery codes offline. The checklist records
  the date each was enabled; the plan tier for a given feature is verified at enable time, not
  assumed.
- **Repository security settings:** secret scanning (automatic on public repositories, E-026), push
  protection, private vulnerability reporting, and Dependabot **alerts** only — version updates stay
  manual, because the 14-day age rule and the pinning decision are the policy.
- **Break-glass, written once:** lost device → rotate `BETTER_AUTH_SECRET`, the database password, the
  Gmail app password, and the Vercel token; revoke all GitHub sessions; then check `audit_events` for
  sign-ins after the loss. This is the incident runbook until WP8 writes the rest.
- **Verification:** the checklist is a file in this repository; a control that is not ticked is
  visibly not done. WP9 re-reads it live rather than trusting this paragraph.

## A13. Browser posture: headers, redirects, cookies — and one honest CSP gap

**Decision.** Every response carries the header set below; every redirect target passes one helper;
cookies are host-scoped and revoked on credential change.

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` — `preload` only after the domain is final, because preload is effectively irreversible |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `X-Frame-Options` | `DENY` (belt and braces beside `frame-ancestors`) |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |

- **Open redirects are closed by construction.** One `safeRedirect(target, requestOrigin)` helper:
  the target must start with a single `/`, must not start with `//` or `/\`, must contain no control
  characters or backslashes, and must resolve — after `URL` parsing — to the request origin. Used by
  sign-in, verification, password reset, and the erasure confirmation. Better Auth's `trustedOrigins`
  is pinned to the deployment origins; `callbackURL` is validated by the same helper.
- **Cookies.** `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`. The
  session cookie is revoked on password change and on erasure.
- **The CSP gap, stated rather than papered over.** A nonce-based CSP requires dynamic rendering, and
  the availability control in A1/A9 depends on these pages being cached. So: CSP is **enforced** on
  authenticated and dynamic routes (nonce per request) and **report-only** on cached public routes
  until WP4 has violation data. What actually prevents script injection on the cached pages today is
  A8 — Markdown rendered to React elements, no `dangerouslySetInnerHTML`, plus the shipped lint ban.
  WP4 either finds a build-time hash policy that works with the cache or keeps the ban as the control
  and says so on the launch checklist; it does not silently ship `script-src 'unsafe-inline'`.
- **Verification** (WP4): a test asserts the header set on a rendered response; a redirect table of
  twelve payloads (`//evil.com`, `/\evil.com`, `\/evil.com`, `https://evil.com`, `%2f%2fevil.com`,
  `/%09/evil.com`, `javascript:alert(1)`, and five more) all land on `/` or 400, never off-site; the
  CSP report-only stream is reviewed before enforcement is claimed.

