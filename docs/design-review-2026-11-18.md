# Design review: Blog Platform Architecture and System Design

Reviewer note · 18 November 2026 · Read-only review, no code written
Subject: `Blog Platform Architecture and System Design.md` (draft, 15 sections)

Tags: **[V]** verified this session against a primary source (named), **[R]** my reasoning, **[U]** unverified.

Method note: web search was unavailable (HTTP 402), so every **[V]** below comes from the vendor's own
documentation or terms, fetched directly. That is stronger evidence than the blogs the original document
leaned on, but it is narrower: it only covers what I thought to check.

---

## Verdict

The architecture is sound and the choice of a modular monolith on Postgres is the right call at this size.
The document's weak point is not structure, it is **quantities**. Three limits were assumed rather than
measured, and one of them (Neon compute) binds before the limit the document worries about, with a much
worse failure mode.

Nothing here needs a redesign. Everything here needs a number.

---

## 1. Blockers

### B1. Neon compute-hours bind before storage, and the failure mode is a full outage

The document treats 1 GB of storage as the scarce resource (§2, §10, §14). Neon's own free-plan page
describes a different binding constraint. **[V] neon.com/faqs/free-plan-limits-and-quotas, last updated 2026-11-03**

| Free-plan allowance | Value |
| --- | --- |
| Compute | **100 CU-hours per project per month** |
| Storage | 1 GB per project (20 GB across all projects) |
| Public network transfer | **5 GB per project per month** |
| Branches | 10 per project |
| Instant restore | **6 hours, capped at 1 GB of change history** |
| Manual snapshots | 1 |

Neon's own arithmetic: 100 CU-hours runs a 0.25 CU compute "for about 400 hours per project per month",
and scale-to-zero fires only after **5 minutes** of inactivity.

400 hours is **13.3 hours per day**. The document's own load estimate is 200 users × 20 views =
4,000 page views per day, which is one request every ~22 seconds on average. Any request inside a
5-minute window keeps the compute awake, so the database would be awake roughly 24 hours a day:
~180 CU-hours, quota gone around day 17. **[R]**

And when it is gone, it is not a degraded mode:

> "the project's compute is suspended until the next billing period or until you upgrade. Existing
> connections drop and new ones can't open." **[V] same page**

That is the whole application down, not "writes fail". §10's reliability table lists the storage failure
and misses this one.

**Consequence for the plan:** caching public reads stops being a Lighthouse optimisation (WP6, N3) and
becomes the thing that keeps the project on the free tier. It has to move early.

**Fix.** State the real ceilings in §3 N5 and §10, then design to them:
400 compute-hours, 1 GB storage, 5 GB egress, 1M invocations, 1 h logs.
Measure CU-hours in the Neon console from week one, and treat the DB as a resource you deliberately
sleep. Do **not** add a keepalive ping; on this plan it is a self-inflicted quota burn.

### B2. Autosave + append-only revisions + 1 GB is a contradiction

Three statements in the document cannot all hold:

- §6: "Revisions are never updated or deleted."
- §7: "Save draft: Zod validate, authorize owner, **insert a new revision**, move draft pointer."
- ADR-007: "Autosave never touches live content."

If autosave is a save, autosave is a revision, and revisions are append-only forever. The "about 25 KB
per post including revisions, so about 40,000 posts" estimate in §2 silently assumes ~3 revisions of an
8 KB post. **[R]**

Sizing at 2,000 words ≈ 12 KB of markdown: **[R]**

| Autosave policy | Revisions per post (20 min of writing) | Bytes per post | Posts in 1 GB |
| --- | --- | --- | --- |
| Explicit save only, ~10 saves | 10 | ~120 KB | ~8,000 |
| Debounced every 60 s | 20 | ~240 KB | ~4,000 |
| Debounced every 10 s | 120 | ~1.4 MB | ~700 |

The headline number is off by one to two orders of magnitude depending on a decision that is not in the
document. It also degrades the restore window, because Neon's 6-hour PITR is capped at **1 GB of change
history** **[V]**, which autosave churn eats.

**Fix (cheapest, keeps the invariant true).** Separate the two things currently conflated:

- `draft_state` — one mutable row per post (`post_id` PK, `title`, `body_markdown`, `updated_at`,
  `base_revision_id`). Autosave upserts here. Nothing is ever appended.
- `post_revisions` — append-only, written only on explicit save-as-version and on publish.

This keeps "history is immutable" true, keeps autosave off the live content, and makes storage
proportional to real editorial events. It also gives you `base_revision_id` for free, which B2's
neighbour below needs.

### B3. Email is not an open question, it is a work-package blocker

§14 lists the email provider as "not chosen, not researched", and the domain name as open. But §3 puts
sign-up and login in v1, §9 wants verification before publishing, and password reset is table stakes.
WP2 (identity) cannot be finished without it, so this cannot wait for WP8.

Verified enough to close the research gap: **Resend Free = 3,000 emails/month, 100/day, 3 verified
domains, DKIM/SPF/DMARC** **[V] resend.com/pricing**. That comfortably covers 200 users. Verification
requires DNS records on a domain you control, so the domain decision has to land before WP2, not WP8.
**[R]**

Also worth pricing in: 100 emails/day is a hard daily cap on the free tier **[V]**, so a signup spike
would silently stop verification mails. Rate-limit signups (which you want anyway) rather than discover
this at launch.

**Option not in the document.** Neon's free plan now lists "**Managed Better Auth up to 60,000 MAU per
project**" as an allowance **[V] neon.com/faqs/free-plan-limits-and-quotas**. That could remove the auth
tables, the rate-limit table and possibly the email plumbing. I have **not** verified what it includes,
what it costs later, or whether it locks identity to the database vendor. Investigate before WP2, not
after; it directly challenges ADR-005 and the "one module owns auth" rule.

---

## 2. Corrections that change decisions

### C1. Better Auth's IP detection is spoofable as configured

§9 credits Better Auth's database limiter and §3 N6 wants sign-in throttling "value set in config and
tested". Better Auth's own docs describe the trap:

> "By default, it reads the address from the `X-Forwarded-For` header. Clients can send this header
> themselves." — with `ipAddressHeaders`, `trustedProxies`, or `ipAddressHeaders: []` as the three
> supported fixes. **[V] better-auth.com/docs/concepts/rate-limit**

If this is left at defaults behind Vercel, an attacker rotates `X-Forwarded-For` and the limiter is
decorative. N6 would pass a naive test and fail a real one. Also verified on the same page: defaults are
10 s / 100 requests, `/sign-in/email` is 3 per 10 s, and **`auth.api` calls are not rate limited** at all,
confirming §9's caveat.

**Fix.** Configure `advanced.ipAddress.trustedProxies` (or a header only your server writes) in WP2, and
make the brute-force test rotate the header to prove it.

### C2. There is no optimistic concurrency, so two tabs silently destroy work

Not mentioned anywhere. Two edits from two devices both write a revision, both move the draft pointer,
last write wins, and the product promise is "I never lose it" (§2). **[R]**

**Fix.** `base_revision_id` (from B2) on every draft save. Reject the write when it does not match the
current pointer, and return the conflict shape in §8's single result type. This is a few lines in WP3 and
impossible to retrofit politely.

### C3. Money says "invoices"; Vercel's terms say personal use

§2 defers hosting to "Ask Mr Tobi whether the platform serves the company's business". That is the wrong
question for the terms you are actually bound by:

> "You shall **only** use the Services under a Hobby plan for your **personal or non-commercial** use."
> … "We reserve the right to disable or remove any Project or website deployment on the Hobby plan with or
> without notice at our sole discretion. We may shut down affected projects or deployments on the Hobby
> plan in case of any delays or performance problems including, without limitation, those caused by a
> malicious attack on a project or deployment." **[V] vercel.com/legal/terms §4, updated 2026-10-19**

Two things follow. First, "non-commercial" is not the only test in that sentence; "personal" is doing work
too, and a public multi-user publishing service is a service for other people. Whether that is fair use
is not something I can settle, and I will not pretend to. Second, the discretionary shutdown clause means
**an abuse wave can take the project offline with no notice**, and a public sign-up form is the cheapest
way to attract one.

**Fix (cheap, and it also serves the product).** Invite-only signup at launch. It reduces the abuse
surface, keeps the Hobby justification cleaner, matches the "5 real writers" validation plan in §2, and
deletes spam controls you would otherwise have to build for §9. Record it as an ADR rather than a config
flag, because it is a reversible product decision with a legal reason.

### C4. `next lint` no longer exists in Next.js 16

WP0 and §11 both say CI blocks on "lint". In 16: "**`next lint` command** — removed. Use Biome or ESLint
directly; `next build` no longer runs linting", and `@next/eslint-plugin-next` now defaults to flat config.
**[V] nextjs.org/blog/next-16, breaking changes**

**Fix.** WP0 must pick the linter and wire it as a standalone script (ESLint flat config or Biome) and
must not assume `next build` fails on lint errors. Same release, same page: Node 20.9+, TypeScript 5.1+.

### C5. The caching question in §14 is answered; use the answer

§7 marked cache invalidation "[U, Next.js 16 caching needs research]". Resolved: **[V] nextjs.org/docs/app/getting-started/caching + blog/next-16**

- Enable `cacheComponents: true` and set `partialPrefetching: true` explicitly in `next.config.ts`
  (unset logs a warning). Dynamic code runs at request time by default; caching is opt-in via `use cache`.
- Publish → `updateTag('post:<slug>')` in the server action gives read-your-writes.
- Feeds and lists → `revalidateTag('feed', 'max')`; the single-argument form is deprecated, and the
  profile argument is now required for stale-while-revalidate.

One trap worth naming, because it collides with B1: per the docs, partial prefetching "costs a server
invocation per prefetchable link". A 20-post feed that prefetches every link is 20 invocations and 20
chances to wake the database. **Fix:** default to shell-only prefetch on list pages and opt in
`prefetch={true}` where it earns its cost.

### C6. Markdown rendering must be server-side, and that is a budget decision not a style one

§9's control is correct and verified: react-markdown is "safe by default (no `dangerouslySetInnerHTML` or
XSS attacks)", HTML is escaped unless you add `rehype-raw`, and `rehype-sanitize` is the answer if plugins
are ever added. **[V] github.com/remarkjs/react-markdown readme, Security + Appendix A**

The document does not say *where* it renders, and that is the difference between N3 passing and failing.
A client-rendered post page ships the markdown parser (~60 KB minzipped for the parser stack, plus the
`rehype-raw` cost the readme quantifies) for content that never changes after publish. **[R]**

**Fix.** Render in a Server Component, wrap in `use cache` keyed by (revision id, or slug + published
revision), so published revisions are computed once and reused — no `dangerouslySetInnerHTML` anywhere,
no parser in the browser bundle. Add an ESLint rule banning `dangerouslySetInnerHTML` so the guarantee is
enforced by CI and not by memory.

### C7. Two schema details that will bite at migration time

- **Composite FK needs a target unique.** §6 wants the pointers to reference the post's *own* revisions via
  a composite FK on `(post_id, revision_id)`. Postgres requires a unique constraint on the referenced
  columns, so `post_revisions` needs `UNIQUE (post_id, id)` in addition to the PK. Without it the
  migration fails. **[R]**
- **Half-states need stating.** "Status published implies `published_revision_id` not null" is one of at
  least four CHECKs: `draft` ⇒ no published pointer and no `published_at`; `published` ⇒ both set;
  `deleted` ⇒ `deleted_at` set and history retained; `published_at` may only be set once. **[R]**
  Also normalise slugs (`lower()` unique index) or `@Name` and `@name` become two publications.

### C8. N7 as written cannot be measured

"Adding a module touches no other module" is false for any real feature: a module inevitably adds a route
under `app/`, a nav entry, and maybe one call into another module's public API. A gate nobody can pass
gets switched off. **[R]**

**Fix.** Make it falsifiable and mechanised: *a new module may add files under `app/` routing and a
registry entry, but must not require edits inside another module's directory; and a deliberately bad
cross-module import must fail CI.* That is exactly the dependency-cruiser / ESLint path rule already named
in §5, so the work is the rule plus one red test, not a new tool.

---

## 3. Gaps not in the document at all

| # | Gap | Why it matters | Where |
| --- | --- | --- | --- |
| G1 | **Backup mechanism is "to be designed"** | Hobby cron is **once per day with ±59 minutes of jitter** and 100 jobs per project **[V] vercel.com/docs/schedules/cron-jobs/usage-and-pricing**, and you cannot run `pg_dump` inside a Vercel Function. So: Neon PITR (6 h, 1 GB change cap) as primary **[V]**, plus a weekly SQL-stream dump into Vercel Blob (1 GB storage, 2,000 advanced ops/month on Hobby) **[V]**, plus one actually-restored drill. "One backup restored and timed" (N4) is only meaningful if the restore path exists before the drill. | WP8 |
| G2 | **Error logging has no owner** | Hobby keeps **1 hour** of runtime logs **[V]**. §10 says "own error logging needed" but nothing decides it. Without it, production debugging is guesswork and the "break it and launch" work package has nothing to read. | WP0/WP8 |
| G3 | **Account deletion and data export** | The product promise is ownership ("I never lose it"), and a Nigerian launch carries NDPR-style duties to delete on request. Neither is in v1, and neither is schema-friendly to retrofit once authors and revisions cascade unknown. Decide the deletion story in WP1 even if the UI ships in v1.1. | WP1 |
| G4 | **`rateLimit` table cleanup** | Correctly flagged as uncleaned in §10 **[U]**, but the fix is the same daily cron as G1. One job, three duties: dump, prune `rateLimit`, prune expired sessions. | WP8 |
| G5 | **Markdown images leak reader IPs** | Image upload is out of v1, but markdown can still embed any remote image. Without a `img-src` allowlist and `referrerpolicy`, every reader pings a third party from inside the post. §9 mentions an allowlist but attaches it to upload, which does not exist yet. | WP4 |
| G6 | **The riskiest assumption is tested last** | §2 says the riskiest assumption is "will people write", and the cheapest test is 5 coursemates publishing after v1 works. That is the most expensive possible order: you build the whole engine before learning whether anyone wants the thing it powers. **[R]** | now |
| G7 | **Toolchain is undecided and partly missing on this machine** | Node 24.12.0, npm 11.6.2, Bun 1.3.14, Docker 29.4.3 present; **pnpm is not installed**. WP0 cannot start without choosing the package manager, because workspaces, boundary tooling and CI all depend on it. Docker being available also means integration tests can run against a local `postgres` container instead of a Neon branch, which is faster and needs no API key in CI. | WP0 |

---

## 4. Claims checked that hold

Recording these so the document keeps the credibility it earned; each is now traceable to a primary source.

| Claim | Status |
| --- | --- |
| Next.js 16 renamed middleware to `proxy.ts`; `middleware` deprecated | **Correct [V]**, nextjs.org blog + file-convention docs. Note `proxy.ts` runs on the **Node.js runtime by default** and the `runtime` option throws, so §4's diagram should not read as "at the edge". |
| Never rely on middleware/proxy alone for auth | **Correct, and now official guidance [V]**: "Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone." Stronger citation than the CVE blog. |
| Hobby gets 1 WAF rate-limit rule | **Correct [V]**, and it is tighter than stated: 1 rule per project, **IP and JA4 keys only**, fixed window, 10 s minimum. You cannot rate-limit by user id at the WAF on Hobby. |
| Hobby: 1M function invocations, 1 h runtime logs, 100 deployments/day | **Correct [V]**, vercel.com/docs/plans/hobby. |
| Neon free: 10 branches, 6 h restore window | **Correct [V]**, plus the 1 GB change-history cap. |
| `neon-http` cannot do interactive transactions; the WebSocket driver can | **Correct [V]**, orm.drizzle.team/docs/connect-neon. Caveat: the doc says the WS driver is *needed*; `pg` over TCP also supports transactions from the Node runtime, so this is a tradeoff (handshake cost vs simplicity), not a hard constraint. On Node 24 a global `WebSocket` exists, so the `ws` + `bufferutil` requirement may not apply — **[U]**, one quick test settles it. |
| Better Auth rate limiting, `auth.api` exempt, database storage | **Correct [V]**, with the IP caveat in C1. |
| react-markdown escapes raw HTML by default | **Correct [V]**, readme Security + Appendix A. |
| Public reads render from the published revision only; drafts 404 for everyone else | **Correct as design [R]**. This is the single most valuable line in §7; keep it. |

---

## 5. Still unverified

- Better Auth account enumeration and timing behaviour (§9 marks this **[U]**; I did not verify it either).
- Better Auth CSRF/session defaults and the cookie-cache/revocation tradeoff (§9 **[U]**).
- `drizzle-kit` collecting multiple per-module schema files (§5 **[U]**) — likely a glob in
  `drizzle.config.ts`, one line to prove.
- What Neon's "Managed Better Auth" allowance actually includes (B3).
- Whether the Hobby "personal use" test tolerates a public multi-user service once signups are open (C3).
  I can cite the clause; I cannot tell you how Vercel will apply it to you.

---

## 6. What I would change before writing any code

1. Rewrite §10's limits table around compute-hours, egress and change history; keep storage as one row
   among five. N5 becomes "$0 up to these measured ceilings".
2. Split `draft_state` from `post_revisions` (B2) and add `base_revision_id` (C2). This is the only change
   that is expensive later, because it is schema.
3. Pick the domain and the email provider now (B3), so WP2 is not blocked behind a decision marked "later".
4. Decide invite-only signup, and record why (C3).
5. In WP0, pin: package manager (pnpm not installed — install it or use npm workspaces), linter invoked
   directly because `next lint` is gone, `cacheComponents` + `partialPrefetching`, and a
   `dangerouslySetInnerHTML` ban.
6. Move the 5-writer test forward and run it on a shared doc this week (G6). It costs a day and it is the
   only test that can invalidate the project rather than the implementation.

No code was written and nothing was committed. This file is untracked; say the word and it becomes the
first commit in the repository.
