# WP3a Step 6 Sign-Off Report

- **Branch:** `wp3a-services`
- **Fix commit:** `91b43c2` (`fix(posts): publish appends a revision instead of binding the version into the uuid pointer`)
- **Local engine:** PostgreSQL **18.3** (throwaway instance, port 55433)
- **CI engine:** `postgres:17` service in `.github/workflows/ci.yml`

## UNVERIFIED (read this first)

1. **CI on `postgres:17` for `91b43c2`** — pending at the time this file was
   written. Everything below is local PG 18.3 evidence. The CI run URL is added
   once the branch workflow finishes.
2. **`post_revisions` append-only enforcement** — application-level only. There
   is no database trigger preventing an `UPDATE`/`DELETE` on a revision. Logged
   for Agent 1 in `docs/handoffs/agent3-needs.md`.
3. **Kernel `ForbiddenError` mapping** — the service still throws its own
   `FORBIDDEN` code; mapping to the kernel error is WP3b.
4. **Agent 1's three `authorize()` divergences** — recorded in the handoff, not
   fixed here (not owned by this worktree).
5. **`origin/kernel-forbidden`** — the task state says PR #8 is merged, but
   `origin/kernel-forbidden` is one commit ahead of `origin/main` and not an
   ancestor; `kernel/errors.ts` on `origin/main` still has no `ForbiddenError`.
   Reported as a discrepancy, not resolved here.

## Exact root cause of the eight failures

`publishPost` bound the integer compare-and-set token into a UUID column and
never created the revision the pointer should name:

```ts
// before, apps/web/src/modules/posts/service/lifecycle.ts
UPDATE posts
   SET status = 'published',
       published_revision_id = ${version},   -- version is draft_state.version (integer)
       published_at = now(),
```

Postgres rejected the bind:

```
Error: Failed query:
UPDATE posts SET status = 'published', published_revision_id = $1, ...
Caused by: error: invalid input syntax for type uuid: "2"
  code: '22P02', routine: 'string_to_uuid'
```

All eight failures had that identical cause. The seven that passed never reached
the pointer update (validation, ownership, injected audit failure before it).
It was a service bug, not the harness: the per-suite `search_path` replay and the
audit triggers were working as designed.

After the fix, publish appends a `post_revisions` row and points at its UUID,
preserves `published_at` with `COALESCE`, treats only an identical republish with
a current token as a no-op, and rejects `deleted -> published` with `CONFLICT`:

```
Test Files  1 passed (1)
Tests  15 passed (15)
[test-count] apps/web/tests/db/wp3a-publish.test.ts: 15 passed, 0 failed, 0 skipped (total: 15)
```

## Gate and mutation proof table

Command prefix for every DB run:
`REQUIRE_DB=1 DATABASE_URL='postgresql://postgres@localhost:55433/inkwellio' pnpm vitest run ...`

| Claim | Command | Exact output | Commit SHA | CI run URL |
| --- | --- | --- | --- | --- |
| Publish suite green (15/15, zero skipped) | `pnpm vitest run apps/web/tests/db/wp3a-publish.test.ts` | `Tests 15 passed (15)`; `15 passed, 0 failed, 0 skipped` | `91b43c2` | pending |
| All five WP3a suites green (87/87, zero skipped) | `pnpm vitest run apps/web/tests/db/wp3a-{publications,reads,slugs,drafts,publish}.test.ts` | `Test Files 5 passed (5)`; `Tests 87 passed (87)` | `91b43c2` | pending |
| Full gate green, 0 lint errors | `pnpm check` | `exit=0`; `4 problems (0 errors, 4 warnings)` (all Agent 1 files) | `91b43c2` | pending |
| Mutation 1: version CAS predicate | remove `AND version = ${expectedVersion}` in `claimVersion`, then the stale-version test | red: `AssertionError: the call must fail: expected false to be true`; restored: `Tests 15 passed (15)` | `91b43c2` | pending |
| Mutation 2: `deleted -> published` guard | remove the `post.status === "deleted"` guard in `publishPost`, then the lifecycle test | red: `AssertionError: expected undefined to be 'CONFLICT'`; restored: `Tests 15 passed (15)` | `91b43c2` | pending |
| Mutation 3: ownership check | replace `assertOwner(...)` with `{ userId: ownerId }` in `lockOwnedPost`, then the stranger test | red: `AssertionError: the call must fail: expected false to be true`; restored: `Tests 15 passed (15)` | `91b43c2` | pending |
| Mutation 4: history before pointer | move the history insert after the slug update in `renamePost`, then the ordering test | red: `Caused by: error: slug moved from order-old-1 before its history row was written` (23514); restored: `Tests 12 passed (12)` | `91b43c2` | pending |
| Mutation 5: audit in transaction | replace `db.transaction(...)` with `fn(db)` in `runInTransaction`, then the audit-failure test | red: `AssertionError: expected 'published' to be 'draft'`; restored: `Tests 15 passed (15)` | `91b43c2` | pending |

Every mutated file was restored with `git checkout -- <path>`; `git status` was
clean before the next proof.

## Three strongest reasons this sign-off could still be too generous

1. **The green evidence is one engine version.** All 87 tests ran on PG 18.3.
   `postgres:17` is the CI contract and has not run for this commit yet, so a
   version-specific behaviour difference (planner, lock ordering, trigger
   semantics) would not show up in this table.
2. **The race proofs are timing-assisted.** The 2-way and 50-way tests use a
   barrier, and the forced-interleaving tests poll `pg_stat_activity`. They prove
   serialisation under the observed schedule, not every schedule; a lock-mode
   change that still passes these runs could break a schedule not exercised.
3. **Two invariants remain application-level.** Revision append-only has no DB
   trigger, and `deleted -> published` is guarded in the service rather than by a
   constraint/transition table. A future code path that writes those tables
   directly would bypass both, and the tests would not catch it.

## Artifacts

- `apps/web/src/modules/posts/service/lifecycle.ts` — publish now inserts the
  revision and points at its UUID.
- `apps/web/tests/db/wp3a-publish.test.ts` — 15/15, no `@ts-expect-error`.
- `docs/EVIDENCE.md` — E-300..E-331.
- `docs/STANDARDS.md` — rows 6 and 8 shipped with evidence ids.
- `docs/reviews/WP3a-self-review.md` — corrected to the verified state.
- `docs/handoffs/agent3-needs.md` — Agent 1 divergences and the append-only gap.
