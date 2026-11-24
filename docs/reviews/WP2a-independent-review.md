# WP2a independent review (different model)

**Reviewed commit:** `2042327` (merge of PR #1 `wp2a-proof`, PR #2 `wp3a-services`).
**Method:** read the merged tree only; ran the repo gate at that commit; compared every
claim with the code that is supposed to enforce it. No source was modified.

**Verdict: WP2a is not proven.** Two bugs are genuinely fixed at unit level (B1, B2) and one
gate is real (G3). The remaining gates test pure functions, hand-built strings, or configuration
objects that **nothing in the application calls**. The database tables Better Auth needs do not
exist, so sign-up and sign-in cannot work end to end.

## Gate table

| Gate | Claim | What the merged code/test actually does | Verdict |
|---|---|---|---|
| B1 | account cross-tenant access denied | `authorize` checks `resource.userId === actor.id`; `b1-b2.test.ts` asserts deny/allow | **PROVEN (unit)** |
| B2 | `23505` → 409 | `mapAuthError` maps it; test asserts code/status | **PROVEN (unit)** |
| G1 | sign-up invariants (1 user+account, lowercase, hashed, duplicates) | lowercase test asserts a locally computed string; "10 simultaneous" is 10 sequential `mapAuthError` calls; the only real tests are `describe.skipIf(!DATABASE_URL)` raw-SQL inserts; **no test calls `signUpEmail`** | **NOT PROVEN** |
| G2 | `__Host-` Secure HttpOnly SameSite cookies | test 1 reads config (real); tests 3–5 assert on a hand-written cookie string and a local `Map`, which no product code produces | **PARTIAL** |
| G3 | every route folder has `policy.ts` | scans `src/app`, fails on a missing/invalid policy; fixtures prove both directions | **PROVEN (static)** |
| G4 | authorization matrix, 4 actors | real calls, but `authorize` has **no production call site**; matrix has no post write rows; it locks in "anonymous may `read_post`" | **PARTIAL** |
| G5 | rate limits, pinned header, canonical email | atomic upsert counter is real; **no production call site**; fails **open** on any DB error; memory fallback is per process | **NOT PROVEN (unwired)** |
| G6 | enumeration + timing | timing block times a pure function and asserts `median >= 0` (always true); enumeration only maps synthetic error strings | **NOT PROVEN** |
| G7 | audit aggregation | `audit.test.ts` is not in the merge | **NOT WRITTEN** |
| B3/B4 | health check, advisory review | still only on `wp2a-proof` (2 commits ahead), not merged | **NOT MERGED** |
| Evidence | E-100..E-199 | `docs/EVIDENCE.md` still contains only E-053 | **MISSING** |
| STANDARDS 14,15,17,22,24 | updated | unchanged since base | **MISSING** |

## Blocking findings

1. **Auth tables do not exist.** `identity/index.ts:53-62` builds `drizzleAdapter` with
   `usePlural: true`, so it expects `sessions`, `accounts`, `verifications` and a rate-limit
   table. The only migration, `apps/web/drizzle/0000_mature_lilandra.sql`, creates 11 tables
   and none of them. `users` (`identity/schema.ts:18-34`) also lacks `name`, `email_verified`
   and `image`. Sign-in writes a session row (`storeSessionInDatabase: true`), so it cannot
   succeed. No test calls `auth.api`, so the gate never sees this.
2. **No user can ever sign in.** `requireEmailVerification: true` (`index.ts:66`) with a
   `sendVerificationEmail` that only logs (`index.ts:79-81`) means every account stays
   unverified forever.
3. **Reset and verification tokens leak into logs.** Both senders log `{ url, token }`
   (`index.ts:70-72`, `79-81`). `kernel/log.ts:39` redacts by **key name**, so `token` is
   redacted but `url` is not — and the token is inside the URL.
4. **The gates guard dead code.** `authorize`, `rateLimitAuth`, `mapAuthError` are defined but
   called nowhere in `apps/web/src` (verified by search). G4/G5/G6 therefore prove library
   behaviour, not system behaviour.
5. **`authorize` is wrong for posts.** `resource.type === "post"` returns `false` for every
   non-admin (`index.ts:251-253`), so an owner cannot publish their own post; and `read_post`
   is public for anonymous, so drafts are not distinguished from published posts. Both are in
   WP3a/WP3b scope and are not covered by the matrix.
6. **`safeRedirect` throws on malformed input.** `decodeURIComponent` runs outside the
   `try` (`index.ts:284`); `/%E0%A4%A` raises `URIError` (verified) → 500 on a crafted `next`.
7. **Rate limiter fails open.** Any DB error is swallowed and falls back to a per-process
   `Map` (`limiter.ts:122-145`), which on serverless is effectively no limit.
8. **Contract breach.** The merge shipped without evidence rows, `STANDARDS.md` edits, the
   self-review, G7, or B3/B4. `docs/reviews/WP2a-self-review.md` is still untracked in
   `.worktrees/wp2a-proof`.

## Gate run at the merged commit

- `pnpm check` at `2042327`: **failed once** — `apps/web/tests/raw-html.test.ts` timed out
  (47.5 s against its own 30 s limit) while three other agents were building.
- The same test alone: **passed** in 14.75 s. So it is a load-sensitive flake, not a
  deterministic failure — but a 30 s budget for a test that runs a Next build is fragile.
- Full log: `.logs/review-wp2a-merged-check.log`.

## Could not verify

- CI run numbers and their pass/fail state: `gh` is installed but **not authenticated**
  (`gh auth status` → not logged in). Every "green on CI" claim is unauditable from this
  machine.
- Runtime behaviour against real Postgres: local DB tests skip without `DATABASE_URL`; the
  CI database is not reachable from here.

## What is genuinely good

- B1 is a real fix and its test would fail against the old code.
- G3 is a real static gate: a route folder without `policy.ts` fails `pnpm check`.
- The rate-limit counter uses an atomic upsert, so the counting itself is sound once wired.
