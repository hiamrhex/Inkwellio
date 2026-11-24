# WP3a plan v3 — posts and publications services (no routes, no UI)

Base `origin/main` b694986; branch `wp3a-services`. Scope kept; three owner changes (22 Nov):
Step 0 is **skipped** (Agent 2 owns `.github/workflows/ci.yml`), so proof comes from a pull-request run, not a
branch push. Identity and audit are **stand-ins until Agent 1 merges**: a small `AuthorizationPort` plus a fake
for identity (`docs/handoffs/identity-api.md` does not exist), and `publish` writes `audit_events` directly in
its own transaction rather than calling `identity/audit.ts`. The raw-html test is untouched; Agent 2 owns its cause.
Repo-wins: ADR-007 allows draft→published, published→published (new revision; same revision = no-op),
published→draft (unpublish), draft|published→deleted, deleted→draft (restore); only deleted→published is illegal.
`kernel/errors.ts` has no FORBIDDEN code, so services expose a typed domain error and WP3b maps it at the boundary.

Steps (one commit each, red first, `pnpm check` before commit; DB tests `apps/web/tests/db/wp3a-*`):
1. Slugs + `ensurePublication`. Verify `wp3a-publications.test.ts`: 50 parallel calls = 1 row; reserved/invalid = VALIDATION; taken slug = CONFLICT; repeat call idempotent.
2. `saveDraft`/`autosaveDraft` CAS (A7). Verify `wp3a-drafts.test.ts`: 200 autosaves = 1 row and 0 revisions; stale version = CONFLICT with 0 writes; explicit save = +1 revision; 102 400 B ok, 102 401 B = VALIDATION; mutation (drop the `version` predicate) shown red.
3. `publish` + lifecycle + audit row in the same transaction. Verify `wp3a-publish.test.ts`: two parallel publishes = one winner; same revision twice = no-op; injected failure rolls back revision, pointer, status and audit; illegal transitions are typed errors and DB-blocked.
4. Rename + slug history + `resolvePostSlug`. Verify `wp3a-slugs.test.ts`: history written before the update; deleted slug not reusable; old slug redirects; rename racing publish has one winner; ADR-016 records the collision rule.
5. Reads. Verify `wp3a-reads.test.ts`: published revision only; owner reads drafts; cursor has no gaps or repeats; limit capped at 50; 10 000 rows + `ANALYZE` + `EXPLAIN` names `posts_feed_idx`.
6. Ownership + error mapping. Verify: B reading A's draft = NOT_FOUND, B writing A's post = FORBIDDEN; mutation on the owner predicate shown red.
7. Evidence E-300..E-399, truthful STANDARDS rows 6 and 8, `docs/reviews/WP3a-self-review.md`, `docs/handoffs/agent3-needs.md`. Verify: each row cites a CI URL for its commit with zero skipped DB tests.

Files: `publications/{service,validation,index}.ts`; `posts/{service/{slugs,drafts,publish,lifecycle,reads},ports,errors,validation,index}.ts`; `tests/db/wp3a-*.test.ts`; `docs/adr/016-*.md`. No schema or migration change.

[ASSUMPTION] executor is `{kind:"db",db} | {kind:"tx",tx}` with `runInTransaction` joining an open tx.
[ASSUMPTION] the first accepted write on a rowless post (version 0) inserts `draft_state` at version 1; publish takes `{requestId}`.
[ASSUMPTION] my DB tests use schema `wp3a_test` via `search_path`, so WP1's `DROP SCHEMA public` cannot race them.
[ASSUMPTION] at 10 000 rows + `LIMIT 50` the planner chooses `posts_feed_idx`; if it does not, I report it rather than weaken the test.

Out of scope: routes, server actions, UI, schema/migrations, identity/kernel/landing edits, dependencies, admin moderation. No code until Richard says "go".
