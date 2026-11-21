# WP3a plan v2 — posts and publications services (no routes, no UI)

Base `origin/main` 2042327; branch `wp3a-services`. Scope kept from the merged plan; overrides applied.
Repo-wins conflicts, stated not silently changed: (1) ADR-007 allows five transitions — draft→published,
published→published (new revision; same revision = no-op), published→draft (unpublish), draft|published→deleted,
deleted→draft (restore); only deleted→published is illegal, so the brief's narrower list loses to ADR-007.
(2) `kernel/errors.ts` has no FORBIDDEN code and an AppError("FORBIDDEN") maps to INTERNAL 500; services expose a
typed domain error (CONFLICT|NOT_FOUND|VALIDATION|FORBIDDEN) and WP3b maps it; handoff to Agent 1 filed.
(3) Part 2 requires an audit row inside the publish transaction, superseding "no audit writing".

Steps (one commit each, red first, `pnpm check` before commit; DB tests are `apps/web/tests/db/wp3a-*`):
0. CI on branch pushes: add only the `on:` trigger in `.github/workflows/ci.yml`. Verify: a run exists for this push.
1. Slug rules + `ensurePublication`. Verify: `pnpm vitest run apps/web/tests/db/wp3a-publications.test.ts` — 50 parallel calls = 1 row; reserved/invalid = VALIDATION; taken slug = CONFLICT; repeat call idempotent.
2. `saveDraft`/`autosaveDraft` CAS (A7). Verify: `wp3a-drafts.test.ts` — 200 autosaves = 1 row, 0 revisions; stale version = CONFLICT and 0 rows written; explicit save = +1 revision; 102 400 B ok, 102 401 B = VALIDATION; mutation (drop the `version` predicate) shown red.
3. `publish` + lifecycle + audit row in the same transaction. Verify: `wp3a-publish.test.ts` — two parallel publishes = one winner; same revision twice = no-op; injected failure rolls back revision, pointer, status and audit; every illegal transition is a typed error and blocked by the DB.
4. Rename + slug history + `resolvePostSlug`. Verify: `wp3a-slugs.test.ts` — history row written before the update; deleted slug not reusable; old slug redirects; race with publish has one winner; ADR-016 records the history-collision rule.
5. Reads. Verify: `wp3a-reads.test.ts` — published revision only; owner reads drafts; cursor has no gaps or repeats; limit capped at 50; 10 000 seeded rows + `ANALYZE` + `EXPLAIN` names `posts_feed_idx`.
6. Ownership + error mapping. Verify: same files — B reading A's draft = NOT_FOUND, B writing A's post = FORBIDDEN; mutation on the owner predicate shown red.
7. Evidence: E-300..E-399, truthful STANDARDS rows 6 and 8, `docs/reviews/WP3a-self-review.md`, `docs/handoffs/agent3-needs.md`. Verify: every row cites a CI URL for its commit with zero skipped DB tests.

Files: `publications/{service,validation,index}.ts`; `posts/{service/{slugs,drafts,publish,lifecycle,reads},ports,errors,validation,index}.ts`; `tests/db/wp3a-*.test.ts`; `docs/adr/016-*.md`. No schema or migration change.

[ASSUMPTION] executor is `{kind:"db",db} | {kind:"tx",tx}` with `runInTransaction` joining an open tx (no Drizzle `.transaction` sniffing).
[ASSUMPTION] the first accepted write on a rowless post (version 0) inserts `draft_state` at version 1; publish takes `{requestId}` for the audit row.
[ASSUMPTION] my DB tests use schema `wp3a_test` via `search_path`, so WP1's `DROP SCHEMA public` cannot race them.
[ASSUMPTION] at 10 000 rows + `LIMIT 50` the planner chooses `posts_feed_idx`; if it does not, I report the plan rather than weaken the test.

Out of scope: routes, server actions, UI, schema/migrations, identity/kernel/landing edits, dependencies, admin moderation. No code until Richard says "go".
