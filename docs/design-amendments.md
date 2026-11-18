# Design amendments

Owner-approved changes to the design doc, 18 November 2026. Notes only, no code.
These override the corresponding sections of `Blog Platform Architecture and System Design.md`.

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
