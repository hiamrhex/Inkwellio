# E-053: Gate lock cleanup for stale locks

**What:** The gate lock must never block pushes forever. A machine crash, killed process, or power failure can leave a stale lock file.

**How verified:** `apps/web/tests/gate-lock.test.ts` tests that the lock manager removes a stale lock when the owner is dead.

**Source:** tools/gate.mjs, apps/web/tests/gate-lock.test.ts.

**Date:** 2026-11-19.

**Status:** Confirmed.

**Details:**
- The lock manager reads the owner's pid from `owner.json` and checks if the process is alive.
- If the process is dead, the lock is removed and the gate proceeds.
- If the process is alive, the gate waits and retries.
- If waiting exceeds 15 minutes, the gate fails with a clear message.
- The test creates a fake stale lock with a dead pid (99999) and verifies that the lock is removed.

**Note on the original "Test failed" flake:** The log was truncated, so the original cause of the flaky gate cannot be proven. The race was reproduced with two simultaneous `pnpm check` runs, and the fix (per-worktree lock) is correct. The gate lock cleanup test ensures that a stale lock never blocks pushes forever.


---

# Evidence Table: WP2a Gates G1 to G9 (E-100 to E-125)

| Evidence ID | Gate | Focus / Description | Test File & Name | Command Run | Key Output Line | Status |
| --- | --- | --- | --- | --- | --- | --- |
| E-100 | G1 | Lowercase email normalization | `apps/web/tests/sign-up.test.ts` > "normalizes email to lowercase before inserting user" | `npx vitest run apps/web/tests/sign-up.test.ts` | `✓ normalizes email to lowercase before inserting user` | Proven |
| E-101 | G1 | Password hashing (not stored plaintext) | `apps/web/tests/sign-up.test.ts` > "hashes password so that stored credential never equals plain text" | `npx vitest run apps/web/tests/sign-up.test.ts` | `✓ hashes password so that stored credential never equals plain text` | Proven |
| E-102 | G1 | Sequential duplicate sign-up conflict | `apps/web/tests/sign-up.test.ts` > "returns a clean conflict error on duplicate sequential sign-up" | `npx vitest run apps/web/tests/sign-up.test.ts` | `✓ returns a clean conflict error on duplicate sequential sign-up` | Proven |
| E-103 | G1 | SQLSTATE 23505 mapping to 409 Conflict | `apps/web/tests/b1-b2.test.ts` > "B2: mapAuthError maps SQLSTATE 23505 to ConflictError with public code CONFLICT" | `npx vitest run apps/web/tests/b1-b2.test.ts` | `✓ B2: mapAuthError maps SQLSTATE 23505 to ConflictError with public code CONFLICT` | Proven |
| E-104 | G1 | Concurrent 10x duplicate sign-up isolation | `apps/web/tests/sign-up.test.ts` > "10 simultaneous duplicate sign-ups produce exactly 1 user row and clean conflict errors" | `npx vitest run apps/web/tests/sign-up.test.ts` | `(Postgres 17 live test in CI run #7)` | Proven in CI |
| E-105 | G2 | Session cookie security flags (`__Host-`, Secure, HttpOnly, SameSite=Lax, Path=/) | `apps/web/tests/cookie-attributes.test.ts` > "sets __Host- prefix, HttpOnly, Secure, SameSite=Lax, Path=/ and no Domain in production" | `npx vitest run apps/web/tests/cookie-attributes.test.ts` | `✓ sets __Host- prefix, HttpOnly, Secure, SameSite=Lax, Path=/ and no Domain in production` | Proven |
| E-106 | G2 | Replay of signed-out session rejected | `apps/web/tests/cookie-attributes.test.ts` > "rejects old session cookie after sign-out" | `npx vitest run apps/web/tests/cookie-attributes.test.ts` | `✓ rejects old session cookie after sign-out` | Proven |
| E-107 | G2 | No session cookie set on error responses (400, 401, 429) | `apps/web/tests/cookie-attributes.test.ts` > "does not set session cookies on 400, 401, or 429 error responses" | `npx vitest run apps/web/tests/cookie-attributes.test.ts` | `✓ does not set session cookies on 400, 401, or 429 error responses` | Proven |
| E-108 | G3 | Sibling `policy.ts` inventory enforcement | `apps/web/tests/route-inventory.test.ts` > "every page and route has a valid sibling policy.ts file" | `npx vitest run apps/web/tests/route-inventory.test.ts` | `✓ every page and route has a valid sibling policy.ts file` | Proven |
| E-109 | G3 | Route inventory rejects missing/illegal policy exports | `apps/web/tests/route-inventory.test.ts` > "inventory check fails when a policy file is missing or invalid" | `npx vitest run apps/web/tests/route-inventory.test.ts` | `✓ inventory check fails when a policy file is missing or invalid` | Proven |
| E-110 | G4 | Full authorization matrix (all actors, own vs other's resources) | `apps/web/tests/auth-matrix.test.ts` > "authorizes matrix of entry points and resources" | `npx vitest run apps/web/tests/auth-matrix.test.ts` | `✓ 43 tests passed` | Proven |
| E-111 | G4 | B1 ownership check on account export/delete | `apps/web/tests/b1-b2.test.ts` > "B1: authorize checks resource.userId === actor.id for account export and delete" | `npx vitest run apps/web/tests/b1-b2.test.ts` | `✓ B1: authorize checks resource.userId === actor.id for account export and delete` | Proven |
| E-112 | G5 | Rate limit trips after configured count | `apps/web/tests/rate-limits.test.ts` > "trips rate limit after configured maximum attempts" | `npx vitest run apps/web/tests/rate-limits.test.ts` | `✓ trips rate limit after configured maximum attempts` | Proven |
| E-113 | G5 | Rotating `x-forwarded-for` does not bypass limiter | `apps/web/tests/rate-limits.test.ts` > "rotating x-forwarded-for does not reset the limit when x-vercel-forwarded-for is pinned" | `npx vitest run apps/web/tests/rate-limits.test.ts` | `✓ rotating x-forwarded-for does not reset the limit when x-vercel-forwarded-for is pinned` | Proven |
| E-114 | G5 | Mixed-case and lookalike emails share rate limit bucket | `apps/web/tests/rate-limits.test.ts` > "mixed-case and lookalike emails share the same rate-limit bucket" | `npx vitest run apps/web/tests/rate-limits.test.ts` | `✓ mixed-case and lookalike emails share the same rate-limit bucket` | Proven |
| E-115 | G6 | Account enumeration protection (identical error status & body) | `apps/web/tests/enumeration.test.ts` > "returns identical status and error body for known and unknown emails" | `npx vitest run apps/web/tests/enumeration.test.ts` | `✓ returns identical status and error body for known and unknown emails` | Proven |
| E-116 | G6 | Constant timing over 50 samples for known vs unknown | `apps/web/tests/enumeration.test.ts` > "measures response timing across 50 samples with comparable medians" | `npx vitest run apps/web/tests/enumeration.test.ts` | `✓ measures response timing across 50 samples with comparable medians` | Proven |
| E-117 | G7 | Aggregated audit rows per (action, ip_hash, 10m window) | `apps/web/tests/audit.test.ts` > "aggregates repeated failures into 1 row with attempt count" | `npx vitest run apps/web/tests/audit.test.ts` | `✓ aggregates repeated failures into 1 row with attempt count` | Proven |
| E-118 | G7 | Audit log redaction (zero plaintext emails or credentials) | `apps/web/tests/audit.test.ts` > "redacts plaintext emails, passwords, and tokens from metadata" | `npx vitest run apps/web/tests/audit.test.ts` | `✓ redacts plaintext emails, passwords, and tokens from metadata` | Proven |
| E-119 | G7 | Transactional fail-closed behavior on audit insert failure | `apps/web/tests/audit.test.ts` > "fails closed if the audit event insert fails" | `npx vitest run apps/web/tests/audit.test.ts` | `✓ fails closed if the audit event insert fails` | Proven |
| E-120 | B3 | `/api/health` 5-second `SELECT 1` timeout and 200/503 status | `apps/web/tests/health.test.ts` > "returns 200 and ok when database is healthy" & "returns 503 and unavailable when database fails or times out" | `npx vitest run apps/web/tests/health.test.ts` | `✓ 4 tests passed` | Proven |
| E-121 | B4 | Next.js 16.4.5 security advisory check and 16.4.6 changes | Security review & release note inspection | `docs/reviews/WP2a-self-review.md` | Recorded: 16.4.5 patched 6 CVEs; 16.4.6 maintenance only | Proven |
| E-122 | G8 | Safe redirect helper with 12 boundary attack vectors | `apps/web/tests/safe-redirect.test.ts` > "sanitizes all 12 unsafe redirect targets to /" | `npx vitest run apps/web/tests/safe-redirect.test.ts` | `✓ sanitizes all 12 unsafe redirect targets to /` | Proven |
| E-123 | G9 | Quality gate: ESLint, TypeScript, Unit Tests, Seam Check, Production Build | `pnpm check` | `pnpm check` in `.worktrees/wp2a-proof` | `Done in 13.5s` | Proven |
| E-206 | WP7 | Landing page Phase A redesign: light/dark themes, contrast >= 4.5:1, touch >= 44px, no trackers, spelling | `apps/web/tests/landing.test.ts` | `pnpm vitest run apps/web/tests/landing.test.ts` | `✓ 38 tests passed` | Proven |
| E-207 | WP7 | @inkwellio/ui primitives: tokens, Chip, SectionHeader, IconTile (squircle), ThemeToggle (single button) | `packages/ui/tests/components.test.ts` | `pnpm vitest run packages/ui/tests/components.test.ts` | `✓ 12 tests passed` | Proven |
