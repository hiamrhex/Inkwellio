# WP3a plan — posts and publications services (no routes, no UI)

Services take an **executor**: the `db` (the service opens one transaction) or an open `tx` (the service joins it). Both modes are tested. Errors are typed — `CONFLICT`, `NOT_FOUND`, `VALIDATION`, `FORBIDDEN` — mapped through `kernel/errors.ts`, which is not edited. Identity is used only through its `index.ts`. Database proofs run on CI; local DB tests skip.

## Ordered steps (one commit each, red first)

0. **CI on branch pushes** — change only the `on:` trigger in `.github/workflows/ci.yml`; proof: a CI run exists for a push to `wp3a-services`.
1. **S1 `ensurePublication`** (+ slug rules) — 50 parallel calls yield one row; reserved/invalid slug → `VALIDATION`; taken slug → `CONFLICT`; existing owner is idempotent.
2. **S2 `saveDraft` (A7)** — 200 autosaves → one `draft_state` row, zero revisions; stale `expectedVersion` → `CONFLICT` and writes nothing; explicit save appends exactly one revision; 100 KiB ok, +1 byte → `VALIDATION`.
3. **S3 `publish` + S4 lifecycle (ADR-007)** — stale version → one success and one `CONFLICT`; republishing the same revision is a no-op success; injected mid-transaction failure changes nothing; `deleted → published` rejected by service and by the DB.
4. **S5 slugs** — post slug unique per publication across all statuses; rename writes `post_slug_history` first; `resolvePostSlug` returns the old posted URL; record the old-slug/new-slug collision rule in a new ADR.
5. **S6 reads** — `getPublishedPost` returns only the published revision; `getPostForOwner` is owner-only; `listPublished` keyset-orders by `(published_at desc, id desc)`, caps limit at 50, no gaps or repeats; seed 10,000 posts, `ANALYZE`, assert via `EXPLAIN` that the feed uses `posts_feed_idx`.
6. **S7 ownership + error mapping** — user B reading A's draft → `NOT_FOUND`; B writing A's post → `FORBIDDEN`.
7. **Evidence + docs** — E-300..E-399, truthful `STANDARDS.md` rows 6 and 8, `docs/reviews/WP3a-self-review.md`.

## Files

- `modules/publications/{service.ts,validation.ts,index.ts}`
- `modules/posts/{service/drafts.ts,service/publish.ts,service/reads.ts,service/slugs.ts,validation.ts,index.ts}` — never `posts/render/**`
- `apps/web/tests/db/wp3a-*.test.ts`, one new slug ADR, evidence and STANDARDS rows 6 and 8

## Unknowns to check in docs and installed types

- Drizzle `onConflictDoNothing()` + `returning()` behaviour on conflict; the `tx` type and the executor union.
- Keyset pagination on `(published_at, id)` where `published_at` is null for drafts.
- Whether the partial index `posts_feed_idx` is actually chosen for the feed query (`EXPLAIN`).
- Which identity exports exist at this base — read `modules/identity/index.ts` before importing.

## What I will not do

No schema or migration change, no new dependency, no routes, server actions or UI, no audit writes (WP3b adds them through the executor), no admin moderation, no edits to `modules/posts/render/**`, `kernel/**`, `modules/identity/**`, `app/api/**`, `proxy.ts`, `env.ts` or `PLAN.md`.
