# Independent Review Template

**Work Package:** [e.g. WP2a Identity Core / WP3a Services / WP7 Landing Page]  
**Reviewed Commit:** [Exact full 40-char SHA]  
**Reviewer:** [Agent Name / Model Name]  
**Date:** [YYYY-MM-DD]  
**Verdict:** [PROVEN | PARTIAL | NOT PROVEN]  

---

## 1. Executive Summary & Verdict

- **Overall Status:** [Concise statement on whether the package is production-ready, partially built, or blocked.]
- **Key Proofs:** [List the 1-2 strongest evidence points verified with real commands.]
- **Key Risks / Blockers:** [List any unbuilt tables, unwired handlers, synthetic-only tests, or missing migrations.]

---

## 2. Gate Verification Table

Every claim in the contract must be evaluated against the real running code, not mocks or synthetic assertions.

| Gate / Claim ID | Contract Requirement | Exact Test File & Command | What the Shipped Code Actually Does | Verdict (`PROVEN` / `PARTIAL` / `NOT PROVEN`) |
| :--- | :--- | :--- | :--- | :--- |
| **G1** | [e.g. Sign-up invariants] | `pnpm --filter @inkwellio/web test tests/sign-up.test.ts` | [Describe real execution against Postgres vs unit logic] | `PROVEN` |
| **G2** | [e.g. Cookie attributes] | `pnpm --filter @inkwellio/web test tests/cookie-attributes.test.ts` | [Inspect production Better Auth config] | `PROVEN` |
| **G3** | [e.g. Route policy enforcement] | `node tools/gate.mjs` (boundaries) | [Static scan ensures every route folder has policy.ts] | `PROVEN` |
| **G4** | [e.g. Authorization matrix] | `pnpm --filter @inkwellio/web test tests/auth-matrix.test.ts` | [Evaluate call sites and policy enforcement] | `PARTIAL` |

---

## 3. Adversarial Attack & Mutation Proofs

A gate is not proven until the product code is intentionally broken (mutated) and the test is shown to fail loudly.

1. **Mutation Check 1 (Negative Test Sensitivity):**
   - **Target File / Line:** [e.g. `apps/web/src/modules/identity/index.ts:210`]
   - **Intentional Defect:** [e.g. flipped `resource.userId === actor.id` to `true`]
   - **Command:** `pnpm --filter @inkwellio/web test tests/b1-b2.test.ts`
   - **Observed Result:** [Test failed with expected AssertionError]
   - **Restored:** [Confirmed restored to clean state, commit clean]

2. **Mutation Check 2:**
   - **Target File / Line:** [...]
   - **Intentional Defect:** [...]
   - **Command:** [...]
   - **Observed Result:** [...]

---

## 4. Built vs. Partial Audit (Dead Code & Wiring Verification)

Verify that exported functions, schemas, and routes are actually wired to production entry points.

- **Unwired Functions:** [List functions defined in modules that have 0 call sites in `apps/web/src/app` or Server Actions.]
- **Schema & Database Alignment:** [Verify whether Drizzle schemas match committed migrations and real Postgres tables.]
- **Route Policy Conformance:** [Verify that every `page.tsx` and `route.ts` has a sibling `policy.ts` exporting valid policy.]
- **Public API Boundary Check:** [Verify that `apps/web/src/app` only imports from module index entry points, never deep internal paths.]

---

## 5. Blocking Findings

List specific, actionable defects that block acceptance.

1. **[Finding Title]:** [Detailed explanation, file path, line numbers, impact, and minimal recommended fix.]
2. **[Finding Title]:** [Detailed explanation, file path, line numbers, impact, and minimal recommended fix.]

---

## 6. Full Gate Run & CI Verification

Every claim requires auditable command evidence from local gate execution and remote GitHub Actions CI.

- **Local Gate Command:** `node tools/gate.mjs` or `pnpm check`
  - **Lint:** [0 errors, N warnings]
  - **Typecheck:** [Clean, 3/3 workspace projects pass]
  - **Build:** [Next.js production build exits 0]
  - **Test Suite:** [N passed, N skipped, 0 failed across all test files]
  - **Seam Boundaries:** [0 dependency-cruiser violations]
- **CI Workflow Run URL:** `https://github.com/hiamrhex/Inkwellio/actions/runs/<RUN_ID>`
- **Tested Commit SHA:** `<40-CHARACTER-COMMIT-SHA>`
- **CI Job Status:** `conclusion: "success"` (Postgres 17 service, secret scan, audit clean)
