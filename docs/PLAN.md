# PLAN

Supersedes §12 of the design doc. Same work packages, reordered where the audit found the risk is.
WP0 is complete (commit `18ff9e1`); WP1 onward is unstarted.

Effort sizes: S ≈ half a day, M ≈ 1–2 days, L ≈ 3+ days (solo, evening work).

## Ordering change and why

The design put caching in WP6, after posts and rendering. Audit R1 shows the database can be suspended by
the free-tier compute quota at the design's *own* load estimate, so public caching is not a performance
task, it is the availability mechanism. **It moves to WP4, before UI work.** Two schema decisions (R2, R3)
move into WP1 because retrofitting them is a migration on live content.

## Work packages

| WP | Goal | Why here | Done when | Risk | Rollback | Size |
| --- | --- | --- | --- | --- | --- | --- |
| **0** | Rails: monorepo, strict TS, ESLint invoked directly (no `next lint`), boundary rule, CI, Zod env validation, ban on `dangerouslySetInnerHTML` | Later packages are checked automatically only if this exists | CI green; a deliberately bad cross-module import fails the build; boot with missing env refuses to start | Low | Revert commit | S |
| **1** | Data layer: schema incl. `draft_state` (mutable, one row per post, `base_revision_id` and monotonic `version`) + append-only `post_revisions` written only on explicit save/publish; composite FK target unique; full status and length CHECKs; case-folded slugs; `ON DELETE CASCADE` from the user; constraint and erasure tests on Docker Postgres | R2, R3, and the privacy cascade are expensive to change once content exists | Constraints proven; 50 parallel publication creations yield one row; 200 autosaves of one post leave one `draft_state` row and zero new revisions; the same `expected_version` twice yields one save and one conflict; deleting a fixture account leaves no residue in any table | **High** (hard to reverse) | Migrations are expand/contract; restore branch before any destructive change | M |
| **2** | Identity: Better Auth, DB rate-limit storage, `ipAddressHeaders: ['x-vercel-forwarded-for']`, authorization policy + matrix harness; email transport behind one interface (Gmail SMTP per brief) with per-email and per-IP OTP limits; export endpoint; erasure request + emailed confirmation token + hard-delete transaction | Blocks every authenticated feature; R4, R8, and R9 live here | Signup/in/out work; matrix skeleton passes; brute-force script that rotates `x-forwarded-for` is still limited; one real verification email arrives from a deployed preview; export returns the fixture account's full history; a confirmed erasure removes the account and reports the row counts | Med (first third-party egress) | Feature flag off; auth tables are additive | M |
| **3** | Publications and posts: drafts via `draft_state`, explicit revisions, publish transaction, slug history, concurrency conflict shape | The product itself | Transaction tests pass; illegal states rejected; two-tab save returns a conflict, not a silent overwrite | High | Soft delete + revision history | L |
| **4** | Read path and caching: `cacheComponents` + `partialPrefetching`, `use cache` + `cacheLife` on public reads, `updateTag()` on publish, RSC markdown (no client parser), CSP + security headers, XSS payload suite, timeouts on every DB call | R1, R6, and N3 all land here | Post page renders from cache with DB asleep; Lighthouse ≥ 90 mobile; payload suite passes; 10 s injected DB latency produces a clean error, not a hang | Med | Deploy previous build; cache is disposable | M |
| **5** | Topics (seeded, no admin UI in v1) and search (published only, paginated, bounded) | Parallel to 4; trims unused admin work | Search returns published posts only; topic pages render | Low | Remove feature flag | M |
| **6** | UI system: tokens, publication page, editor (incl. conflict notice), post page, feed, empty/error states, privacy and terms pages, export and delete-account screens, WCAG 2.2 AA | Needs 4's rendering contract; privacy needs 2's endpoints | Axe clean on key pages; keyboard-only pass; 360 px and 200 % zoom OK; export downloads and the delete flow completes | Low | Static, revertable | L |
| **7** | Landing page: static, honest claims only | After UI tokens | Static build; budget met | Low | Revert | S |
| **8** | Operate: Vercel + Neon envs in `lhr1`/`aws-eu-west-2`, preview branch, CU-hour dashboard and alert, weekly logical dump to Blob + restore drill, nightly cron sharing dump/prune/cleanup duties, error sink, status page, runbooks | R1 and R7 become observable here | One restore performed and timed; error trace follows request → log; status page reachable when the app is not | Med | Each piece independent | M |
| **9** | Break and launch: attack catalogue, assume-breach tests, failure drills, independent review | Proves the rest | Report with unverified list; findings closed or accepted in `RISK_REGISTER.md` | Med | — | M |

**Critical path:** 0 → 1 → 2 → 3 → 4 → 6 → 8 → 9.
**Parallel:** 5 after 3; 7 after 6's tokens.

## Gates that must exist before WP3 accepts content

1. Bad import fails CI (WP0).
2. Constraint tests run on real Postgres (WP1).
3. Authorization matrix skeleton green (WP2).
4. Public read path cached and measured (WP4) — **do not invite a writer before this exists**, or the first
   five writers are also the ones who discover R1.
5. Erasure test green and `/privacy` published (WP1/WP6) — **do not open public signup before this exists**.

## What is deliberately not planned

Comments, likes, follows, image upload, RSS, suggested edits, admin UI for topics, staging environment,
multi-region, SBOM/provenance. Each is a named omission, not an oversight; v1's promise is ownership,
history, and a calm page.

## Sequencing risk worth stating

WP1 is the one-way door. Everything else can be reverted with a commit. If the schema is wrong, the fix is
a migration over real content, which is the only genuinely hard thing in this plan. That is why the two
schema decisions from the audit are settled before WP1 starts rather than during it.
