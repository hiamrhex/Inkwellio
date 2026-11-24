# WP3a Self-Review: Posts & Publications Services

- **Author:** Agent 3 (Posts & Publications)
- **Target:** WP3a (Steps 4–7, real Postgres)
- **Branch:** `wp3a-services` against `origin/main` f614c54
- **Date:** 2026-11-24

## Overview

This self-review validates the WP3a service layer against the accepted plan v3 and
ADR-007. Every claim below was re-run on a real Postgres **18.3** instance on
2026-11-24. CI runs the same gate against `postgres:17`; the CI column is marked
separately until that run is green.

Suite totals on PG 18.3 (`REQUIRE_DB=1`, zero skipped):

| Suite | Tests | Result |
| --- | --- | --- |
| `wp3a-publications.test.ts` | 35 | 35 passed |
| `wp3a-reads.test.ts` | 15 | 15 passed |
| `wp3a-slugs.test.ts` | 12 | 12 passed |
| `wp3a-drafts.test.ts` | 10 | 10 passed |
| `wp3a-publish.test.ts` | 15 | 15 passed |
| **Total** | **87** | **87 passed, 0 failed, 0 skipped** |

## Root cause of the eight publish failures (fixed)

The earlier 7/15 result was **not** environmental. `publishPost` wrote

```sql
UPDATE posts SET published_revision_id = ${version}, ...
```

where `published_revision_id` is `uuid` and `version` is the integer
compare-and-set token from `draft_state`. It also never inserted a
`post_revisions` row, so there was nothing for the pointer to name. Postgres
rejected the bind with SQLSTATE `22P02`:

```
Caused by: error: invalid input syntax for type uuid: "2"
  routine: 'string_to_uuid'
```

All eight failures shared that exact stack; the seven that passed were the paths
that never reached the pointer update (validation, ownership, injected audit
failure before the pointer).

The fix in `apps/web/src/modules/posts/service/lifecycle.ts`:

1. Append the revision the publish makes public (`INSERT INTO post_revisions ...
   RETURNING id`) and point `published_revision_id` at **that UUID**.
2. Preserve `published_at` with `COALESCE(published_at, now())`, so a republish,
   an unpublish/republish cycle and a restore never move the original timestamp.
3. Treat an identical republish as a no-op **only when the caller's version is
   current**; a stale token is still `CONFLICT`, which is what makes the parallel
   publish races produce one winner.
4. Reject `deleted -> published` explicitly with `CONFLICT` instead of letting
   the `posts_deleted_at_check` constraint fail as an internal error.
5. Return a narrower `PublishResult` with a required `publishedAt: Date`, which
   removed the `@ts-expect-error` from the test.

## Step 4: Rename + Slug History + `resolvePostSlug`

- `wp3a-slugs.test.ts`: 12/12 on PG 18.3.
- `post_slug_history` is written **before** `posts.slug` moves, in the same
  transaction; `ON CONFLICT DO NOTHING` makes a return to an old address
  idempotent.
- A retired address is never reused by a different post in the same publication.
  A post may return to its own old address.
- `resolvePostSlug` prefers the live slug, returns `redirect: true` for a
  historical slug, resolves nothing for drafts/deleted posts, and never matches
  across publications.
- 50 concurrent renames serialise to one winner and one history row.
- The suite installs a `BEFORE UPDATE OF slug` trigger that raises unless the
  retired slug is already in history. This is the ordering proof, not a comment.

## Step 6: Publish Lifecycle + Atomicity + Ownership + Error Mapping

- `wp3a-publish.test.ts`: 15/15 on PG 18.3, zero skipped.
- ADR-007 transitions: `draft -> published`, `published -> published` (newer
  revision), `published -> draft`, `draft|published -> deleted`,
  `deleted -> draft`. Only `deleted -> published` is illegal and throws
  `CONFLICT`.
- Atomicity: both injected audit failures (before insert and after insert) roll
  the whole publish back — 0 revisions, 0 audit rows, draft version unchanged.
- Idempotency: a retried `requestId` returns a no-op with the original revision
  even when the caller's version is now stale; exactly one revision and one
  audit row remain.
- Races: 2-way and 50-way parallel publishes from one version produce exactly one
  winner, one revision and one audit row; every loser is `CONFLICT`.
- Ownership: a stranger gets `FORBIDDEN` before any row is read for update, and
  nothing is written.
- Error mapping: the service keeps its own `CONFLICT`/`NOT_FOUND`/`VALIDATION`/
  `FORBIDDEN` codes; kernel `ForbiddenError` mapping remains WP3b's job.

## Mutation proofs (5/5, each break -> red -> restore -> green)

| # | Mutation (file:line at time of test) | Red output | Restored output |
| --- | --- | --- | --- |
| 1 | Remove `AND version = ${expectedVersion}` from `claimVersion` (`lifecycle.ts`) | `AssertionError: the call must fail: expected false to be true` | 15/15 passed |
| 2 | Remove the `post.status === "deleted"` guard in `publishPost` (`lifecycle.ts`) | `AssertionError: expected undefined to be 'CONFLICT'` | 15/15 passed |
| 3 | Replace `assertOwner(...)` with `{ userId: ownerId }` in `lockOwnedPost` (`lifecycle.ts`) | `AssertionError: the call must fail: expected false to be true` | 15/15 passed |
| 4 | Move the `post_slug_history` insert after the `posts.slug` update in `renamePost` (`slugs.ts`) | `Caused by: error: slug moved from order-old-1 before its history row was written` (SQLSTATE 23514) | 12/12 passed |
| 5 | Replace `db.transaction(...)` with `fn(db)` in `runInTransaction` (`publications/domain.ts`) | `AssertionError: expected 'published' to be 'draft'` | 15/15 passed |

Every mutated file was restored with `git checkout -- <path>` before the green
run; `git status` was clean afterwards except for the report file.

## Step 7: Evidence, Standards & Handoffs

- **`docs/EVIDENCE.md`:** E-300..E-324 appended, each with the command and the
  exact output line from the local PG 18.3 run.
- **`docs/STANDARDS.md` rows 6 and 8:** now record the shipped constraint and
  concurrency proofs with their evidence ids. The status line names local PG
  18.3 explicitly and keeps the `postgres:17` CI column pending until the run is
  green.
- **`docs/handoffs/agent3-needs.md`:** records Agent 1's three `authorize()`
  divergences and the missing append-only enforcement on `post_revisions`.
- **First 3 files to read:** `apps/web/src/modules/posts/service/lifecycle.ts`,
  `apps/web/tests/db/wp3a-publish.test.ts`,
  `apps/web/src/modules/posts/service/slugs.ts`.

## Remaining gaps (not claimed as done)

- CI `postgres:17` for this branch is pending until the push's workflow run is
  green; the local evidence above is PG 18.3 only.
- `post_revisions` has no database-level append-only trigger (application-level
  only). Logged for Agent 1 in the handoff.
- Kernel `ForbiddenError` mapping is WP3b.
