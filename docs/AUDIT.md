# AUDIT — design coverage

Date: 18 November 2026 · Mode: AUDIT (plan-level) · Tier: T2 · Evaluator: the agent that wrote the review
(so section 6 exists to correct for that).

## 0. Two scores, not one

| Measure | Score |
| --- | --- |
| **System implementation** | **0 / 3 — L0 (empty repository, zero commits)** |
| **Design coverage of the T2 bar** | **39 % weighted** (details below) |

Design coverage is scored 0–3 where 2 means "designed with specifics" and 3 means "designed with a stated
verification method". Per the skill's scoring rule, design intent without measured behaviour caps the
*system* at 1; with no system at all, every layer is 0. The 39 % is the useful number: it is the map of
where the plan is silent.

## 1. Domain summary

| Domain | Weight (T2) | Layers | Mean | Weighted |
| --- | --- | --- | --- | --- |
| A Product | 1.0 | 4 | 0.58 | 0.58 |
| B Architecture | 1.0 | 8 | 0.63 | 0.63 |
| C Security | 1.5 | 13 | 0.44 | 0.65 |
| D Data & privacy | 1.5 | 4 | 0.42 | 0.63 |
| **E Reliability** | 1.5 | 13 | **0.15** | **0.23** |
| F Delivery safety | 1.0 | 7 | 0.24 | 0.24 |
| G Operations | 1.0 | 9 | 0.41 | 0.41 |
| H Quality & UX | 1.0 | 7 | 0.57 | 0.57 |
| **I Governance** | 1.0 | 6 | **0.17** | **0.17** |
| **Total** | **10.5** | **71 scored** | — | **4.10 → 39 %** |

Layers 25, 26 (AI/agentic) and 32 (public-data provenance) are excluded with reason: no model, no external
dataset. That is 71 of 74.

The shape of the result is the finding: **the plan is strong where the developer is confident (architecture,
data model, CI, tests) and near-silent where nobody enjoys looking (reliability, operations, governance).**
Reliability at 15 % is the domain that contains the outage risk.

## 2. Layer detail

### A — Product
| # | Score | Evidence or gap |
| --- | --- | --- |
| 1 | 2 | JTBD, users, non-goals explicit; all metrics are technical, no adoption metric |
| 2 | 2 | N1–N8 have targets and a "verified by" column — genuinely good; no requirement→test map |
| 3 | 2 | Strong invariants §6; no explicit state machine for post lifecycle |
| 4 | 1 | Spam/takedown mentioned; no per-journey misuse stories |

### B — Architecture
| # | Score | Evidence or gap |
| --- | --- | --- |
| 5 | 3 | Modules, one-way deps, CI enforcement, bad-import proof |
| 6 | 2 | Best section of the doc; missing `draft_state`, composite-FK target unique, full CHECK set, slug case-folding |
| 7 | 1 | One result shape + pagination; no versioning, idempotency, status codes |
| 8 | 1 | Transactions yes; no optimistic locking, no concurrency test |
| 9 | 3 | ADR index + template + revisit triggers |
| 10 | 1 | Assumptions table; no vendor exit paths or limits register (now in STANDARDS) |
| 11 | 2 | SPOFs named; none mitigated |
| 12 | 2 | Env Zod at boot; no flags, no progressive config |

### C — Security
| # | Score | Evidence or gap |
| --- | --- | --- |
| 13 | 1 | Security table is a mini threat model; no trust boundaries, no STRIDE/LINDDUN |
| 14 | 2 | Better Auth + hashing + limiter; enumeration/timing unverified; IP header unpinned |
| 15 | 3 | Deny-by-default + ownership + matrix test + route inventory |
| 16 | 2 | Zod at boundaries, escaping by default; no size limits |
| 17 | 1 | Delegated to Better Auth, defaults unverified |
| 18 | 2 | Env validation + secret scan; no rotation drill |
| 19 | 1 | CSP with nonces named; no HSTS/CORS/referrer/frame policy |
| 20 | 1 | Image allowlist mentioned, attached to a feature that does not exist yet |
| 21 | 1 | Dependency audit in CI; no SBOM/provenance (accepted, see STANDARDS §4) |
| 22 | 2 | Three layers designed; WAF reality is IP-only, so per-user limits must live in-app |
| 23 | 1 | No banned-pattern lint (this is what stops the XSS and raw-SQL classes) |
| 24 | 0 | Absent |
| 27 | 0 | No SECURITY.md, no disclosure path |

### D — Data & privacy
| # | Score | Evidence or gap |
| --- | --- | --- |
| 28 | 2 | Migrations + migration check in CI; pooled vs direct URL not discussed |
| 29 | 1 | "Mechanism to be designed"; N4 unmeetable today |
| 30 | 2 | Constraints, soft delete, append-only revisions |
| 31 | 0 | No retention, export, or deletion story |

### E — Reliability  ← the weak domain
| # | Score | Evidence or gap |
| --- | --- | --- |
| 33 | 1 | Targets, no SLIs or error budget |
| 34 | 0 | No timeouts anywhere |
| 35 | 0 | No retry/backoff policy |
| 36 | 0 | No breakers or bulkheads |
| 37 | 0 | No load shedding or admission control |
| 38 | 1 | "Fail closed for writes, cached reads" — a sentence, not a design |
| 39 | 1 | No fail-open/closed matrix per component |
| 40 | 1 | Single region accepted in writing |
| 41 | 0 | No blast-radius analysis |
| 42 | 0 | No load test |
| 43 | 0 | No cascading-failure analysis |
| 44 | 1 | Two drills named (rollback, restore); no failure injection |
| 45 | 1 | Health route named; no cold-start budget, no graceful shutdown |

### F — Delivery safety
| # | Score | Evidence or gap |
| --- | --- | --- |
| 46 | 3 | §11 is the strongest paragraph in the document |
| 47 | 1 | Rollback drill; no preview-environment canary discipline |
| 48 | 1 | Rollback named; expand/contract migrations not |
| 49 | 0 | No environment separation (no staging) |
| 50 | 0 | No versioning or changelog |
| 51 | 0 | No change-risk review (solo, but still needed) |
| 52 | 0 | No expiry/rotation calendar (domain, certs, keys, quota) |

### G — Operations
| # | Score | Evidence or gap |
| --- | --- | --- |
| 53 | 1 | "Own error logging needed" — no owner, no tool |
| 54 | 1 | Storage alert at 80 % only |
| 55 | 0 | No runbooks, no break-glass |
| 56 | 0 | No incident process |
| 57 | 1 | Admin role + takedown; no audit log of admin actions |
| 58 | 1 | Reset flow open; no export, no deletion, no support channel |
| 59 | 2 | $0 target, ceilings now enumerated |
| 60 | 2 | ADRs + design doc; no README yet |
| 61 | 2 | WP9 launch checklist |

### H — Quality & UX
| # | Score | Evidence or gap |
| --- | --- | --- |
| 62 | 2 | Pyramid implied, matrix + XSS suite named |
| 63 | 2 | "Every package starts with failing tests" |
| 64 | 2 | Lighthouse 90 mobile + budget |
| 65 | 2 | WCAG 2.2 AA |
| 66 | 1 | 5-writer test exists but is scheduled last |
| 67 | 2 | Strict TS, lint, boundaries; setup-time target absent |
| 68 | 1 | Caching was `[U]`; now resolved in STANDARDS |

### I — Governance
| 69 | 0 | No delivery metrics |
| 70 | 1 | No CODEOWNERS/branch protection; ToS now checked |
| 71 | 0 | No privacy policy, terms, NDPA mapping |
| 72 | 2 | Blind review in WP9 |
| 73 | 0 | No drift prevention |
| 74 | 0 | Bus factor 1, no runbook a stranger could follow |

## 3. Top 10 risks, ranked by harm to real users

| # | Risk | Sev | How to confirm it | Fix in |
| --- | --- | --- | --- | --- |
| R1 | Neon compute quota exhaustion suspends the DB → whole site down mid-month | **Critical** | Compute 4,000 views/day against the plan; watch CU-hours until suspended | WP4 (caching moved earlier), WP8 |
| R2 | Autosave × append-only revisions contradicts the 1 GB budget | **Critical** | Generate 200 autosaves for one post, measure table size | WP1 |
| R3 | No optimistic concurrency → two tabs silently lose a draft | **Critical** | Two tabs, save both, diff revisions | WP1/WP3 |
| R4 | Email path undecided; Gmail 500/day is a hard ceiling and SMTP egress from Vercel is unproven | High | Send one verification mail from a deployed preview | WP2 |
| R5 | Hobby terms: "personal or non-commercial" + discretionary shutdown of a public UGC site | High | Read E-009; decide invite-only before public signup | launch decision |
| R6 | No timeouts/retries/breakers: a slow Neon becomes a 300 s function hang | High | Inject 10 s DB latency, observe user-facing behaviour | WP4 |
| R7 | No backup path: N4 cannot be met, and 6 h PITR is capped at 1 GB of churn | High | Attempt a restore today; there is nothing to restore | WP8 |
| R8 | No retention/export/deletion — user data accumulates with no lawful exit | High | Sign up, then try to delete the account and all traces | WP1 + WP6 |
| R9 | Auth brute force passes a naive test because the IP source is unpinned | Med-High | Script 500 attempts rotating `x-forwarded-for` | WP2 |
| R10 | Boundary/CI rules exist only on paper until a red build proves them | Med | Add a deliberately bad import; CI must fail | WP0 |

## 4. Quick wins (each under an hour, each removes a risk class)

1. Invite-only signup at launch: kills most of R5 and most abuse cases at once.
2. Ban `dangerouslySetInnerHTML` in lint: makes the XSS class non-recurring (rule 12).
3. Pin `ipAddressHeaders: ['x-vercel-forwarded-for']`: removes R9 by configuration.
4. `cacheLife` on public reads from the first page built: buys R1 headroom before traffic exists.
5. One labelled WAF rule on `/sign-in*` and `/api/auth/*`: uses the single Hobby rule where it matters most.

## 5. Unverified list (lead with it, per the contract)

- **U-1** `drizzle-kit` with multiple per-module schema files — blocks WP1.
- **U-2** Better Auth version compatibility with Next.js 16 `proxy.ts`; enumeration and timing behaviour.
- **U-3** **SMTP egress from Vercel Functions on port 587/465.** The brief mandates Gmail SMTP; if Vercel
  throttles or blocks outbound SMTP, the whole email plan collapses. Test before building on it.
- **U-4** Whether Neon's "Managed Better Auth" free allowance changes ADR-005.
- **U-5** Neon CU-hour consumption under real caching — R1 is arithmetic, not measurement.
- **U-6** Whether Hobby's "personal use" clause tolerates a public multi-user service. I can quote the
  clause; I cannot predict enforcement.
- **U-7** All standard versions in STANDARDS §5 are `[S]`, not re-opened this session.

## 6. Why this score may be too generous — and too harsh

**Too generous:**
1. I scored *design intent*, and the design doc was written by the same person whose plan I am grading.
   A 39 % coverage score for 15 pages of prose may still be flattering: it counts a named word as coverage.
2. The 3s cluster where the author already had strong opinions (boundaries, CI, ADRs). Where the author was
   uninterested, I scored 0 rather than asking whether the layer is even needed at T2. Some of those 0s may
   be acceptable omissions rather than defects.
3. I weighted by the skill's defaults, not by this product. For a writing app, `E` and `D` matter more than
   the table suggests; if I re-weighted by "what kills the product", the score would fall, not rise.

**Too harsh:**
1. An empty repo *should* score 0; charging it for "no runbooks" is arguably premature for a project with
   no users.
2. I may be over-penalising the absence of formal SLOs and load tests at 200 users, where a caching change
   and one alert would be proportionate.
3. Governance layers (69, 73, 74) are largely unactionable for one developer, so scoring them 0 flatters
   nobody and may distract from R1–R4.

## 7. The 30-minute self-check the human can run alone

1. **R1, 15 min:** open the Neon console, note the project's CU-hours today. Then open the app in five tabs,
   wait 6 minutes, refresh one tab, and watch whether compute wakes. If it wakes on every visit after idle,
   the quota clock is running on human patience, not traffic.
2. **R3, 5 min:** with any markdown editor prototype, open the same draft in two tabs, type in both, save
   both. You will see exactly the loss the design currently permits.
3. **R10, 10 min:** add `import { db } from '../../identity/service'` to a file in `posts/`. If CI stays
   green, the boundary rule is a sentence rather than a gate.

## 8. Recommended path

Do not start WP0's rails in isolation. Two schema decisions (R2, R3) and one caching decision (R1) change
what WP0 must pin, so settle them first — all three are already written up, none needs code. Then WP0.
