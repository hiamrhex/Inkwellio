# Plan: Gate and CI Hardening (Agent 2)

## Files to Change
- .github/workflows/ci.yml, lighthouserc.json
- tools/gate.mjs, vitest config
- apps/web/tests/raw-html.test.ts, apps/web/tests/db/**/*.test.ts
- docs/reviews/TEMPLATE.md, docs/runbooks/disk.md

## Verification Commands
1. REQUIRE_DB: REQUIRE_DB=1 pnpm --filter web test tests/db (fails if DATABASE_URL unset).
2. CI Postgres 17: CI push/PR triggers .github/workflows/ci.yml with service & per-file test count validation.
3. Raw-HTML flake: pnpm --filter web test tests/raw-html.test.ts (<15s); dangerouslySetInnerHTML mutant fails.
4. Gate lock: 2 concurrent node tools/gate.mjs runs serialize; stale dead PID lock clears.
5. Lighthouse CI: CI job runs lhci against production build; uploads report.
6. Review template & runbook: Verify docs/reviews/TEMPLATE.md and docs/runbooks/disk.md.
7. Repository gate: pnpm check exits 0.

## Out of Scope
- No edits to product application code outside raw-html.test.ts and test DB gating.
- No review of Agent 1 repair (Agent 3 owns).
- No local installation of Lighthouse or Playwright (disk constraint 2.6 GB).

## Assumptions
- [ASSUMPTION] DB test runner fails on missing DATABASE_URL when REQUIRE_DB=1.
- [ASSUMPTION] lighthouserc.json created from WP7 specs if landing-needs.md unavailable.
- [ASSUMPTION] Richard handles gh auth login and branch protection manually.
