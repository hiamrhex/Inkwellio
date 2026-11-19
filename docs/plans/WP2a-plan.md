# WP2a Plan: Identity Core Repair & Proof

1. **Step A (B1 & B2):** Fix B1 (`authorize()` account check `resource.userId === actor.id`) and B2 (map SQLSTATE 23505 to 409 in `mapAuthError`). Tests: `apps/web/tests/auth-matrix.test.ts` and `apps/web/tests/errors.test.ts`.
2. **Step 1 (G1):** Prove sign-up creates 1 user/account, stores email lowercase, hashes password, and rejects sequential/concurrent duplicates cleanly. Test: `apps/web/tests/sign-up.test.ts`.
3. **Step 2 (G2):** Prove sign-in sets `__Host-` Secure HttpOnly SameSite=Lax cookies, sign-out invalidates cookie, and 4xx responses set no cookie. Test: `apps/web/tests/cookie-attributes.test.ts`.
4. **Step 3 (G3):** Enforce sibling `policy.ts` convention for all routes and server actions; verify missing policy fails. Test: `apps/web/tests/route-inventory.test.ts`.
5. **Step 4 (G4):** Replace placeholder matrix test with real assertions across all entry points, 4 actors, own/other resources. Test: `apps/web/tests/auth-matrix.test.ts`.
6. **Step 5 (G5):** Prove rate limit trips after configured count, header rotation of `x-forwarded-for` does not evade `x-vercel-forwarded-for`, and mixed-case emails share one bucket. Test: `apps/web/tests/rate-limits.test.ts`.
7. **Step 6 (G6):** Prove known/unknown emails yield identical status/body shape and record 50-sample timing medians. Test: `apps/web/tests/enumeration.test.ts`.
8. **Step 7 (G7):** Prove 5 failed sign-ins aggregate into 1 `audit_events` row (A10), scan finds no plaintext email, and audit failure fails the action. Test: `apps/web/tests/audit.test.ts`.
9. **Step 8 (B3 & B4):** Fix `/api/health` with `SELECT 1` and 5s timeout (A11), and record Next.js 16.4.5 vs 16.4.6 security advisory review. Test: `apps/web/tests/health.test.ts`.
10. **Step 9 (Proof & Standards):** Record evidence E-100 to E-199 in `docs/EVIDENCE.md`, update `docs/STANDARDS.md` (rows 14, 15, 17, 22, 24), update `docs/adr/005-better-auth.md`, and update `docs/reviews/WP2a-self-review.md`.

- **Unknowns to check:** Better Auth internal rate-limiter atomicity under Postgres adapter; simulation method for `x-vercel-forwarded-for` in test harness; verify sibling `policy.ts` exports do not interfere with Next.js App Router routing.
- **What I will not do:** Add zero dependencies; touch no Agent 2 files (`packages/ui/**`, `next.config.ts`, `modules/posts/**`, `preview/**`); add no UI screens; do not implement WP2b export/erasure endpoints.
