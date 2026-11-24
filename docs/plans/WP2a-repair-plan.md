# WP2a Repair Plan: Identity Core (21 Nov 2026)

Target: Reconcile schema, mailer, token redaction, authorize(), safeRedirect, fail-closed rate limiter, call sites, and end-to-end identity proofs.

## Files to Change
- Schema & Migration: `apps/web/src/modules/identity/schema.ts`, `apps/web/drizzle/*` (generate migration)
- Email & Log Redaction: `apps/web/src/modules/identity/email.ts`, `apps/web/src/kernel/log.ts`
- Policy & Call Sites: `apps/web/src/modules/identity/authorize.ts`, `apps/web/src/modules/identity/index.ts`, `apps/web/src/modules/identity/limiter.ts`, `apps/web/src/app/api/auth/[...all]/route.ts`, `docs/handoffs/identity-api.md`
- Tests: `apps/web/tests/e2e-identity.test.ts`, `apps/web/tests/sign-up.test.ts`, `apps/web/tests/cookie-attributes.test.ts`, `apps/web/tests/enumeration.test.ts`, `apps/web/tests/rate-limits.test.ts`, `apps/web/tests/safe-redirect.test.ts`, `apps/web/tests/log-redaction.test.ts`
- Documentation: `docs/STANDARDS.md`, `docs/EVIDENCE.md`, `docs/adr/005-better-auth.md`, `docs/reviews/WP2a-self-review.md`

## Verification Commands
1. Schema & Migration: `pnpm --filter @inkwellio/web exec drizzle-kit generate` && `npx vitest run apps/web/tests/db/postgres.test.ts` (exits 0)
2. Redaction & Email: `npx vitest run apps/web/tests/log-redaction.test.ts` (exits 0)
3. safeRedirect & Authorize: `npx vitest run apps/web/tests/safe-redirect.test.ts apps/web/tests/auth-matrix.test.ts` (exits 0)
4. Limiter Fail-Closed & Route Proofs: `npx vitest run apps/web/tests/rate-limits.test.ts` (exits 0)
5. End-to-End Real Postgres & Route Proofs: `npx vitest run apps/web/tests/e2e-identity.test.ts` (exits 0)
6. Repository Gate: `pnpm check` (exits 0)

## Out of Scope
- Posts, publications, UI, landing pages. [ASSUMPTION: Agent 2, 3, 4 own these].
- Local manual SMTP server test [ASSUMPTION: U-3 Gmail SMTP connectivity on Vercel 587/465 is tested by Richard in deployment].
