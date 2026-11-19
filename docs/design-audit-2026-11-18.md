# Design Audit: Blog Platform vs the Distinguished-Systems Standard

Received 19 November 2026, written 18 November 2026. Stored verbatim as the input to
`design-amendments.md` §Triage. Not edited: a review that gets rewritten to match the response is
worthless as evidence.

Date: 18 November 2026 · Mode: AUDIT (design review) · Risk tier: T2 (public app, accounts, user-written content) · Subject: "Blog Platform: Architecture and System Design" (15 sections)

**Read this first.** I wrote the design and I am grading it, which the standard itself warns against. Treat this as a self-review that finds gaps, not as a verdict. It needs the blind review described at the end. Only the design document was audited. No code exists, so nothing could be measured.

## 1. Result

| Measure | Value | What it means |
|---|---|---|
| Maturity by the skill's rules | **L0** (nothing runs) | Design intent without measured behaviour caps every layer at 1 |
| Weighted score, skill rules | **9.5 / 250.5 = 3.8%** | 8 layers capped at 1, all others 0. Mechanical, expected before any build |
| Design coverage (my own supplementary measure) | Designed with a check: **8** · Acknowledged only: **40** · Missing: **21** · Not applicable: **5** (of 74) | Shows what to add before building |

Status key: **D** designed with a concrete check · **A** acknowledged, no complete design · **M** missing · **N/A** skipped with a reason.

## 2. Top 10 gaps (fix in the design before building)

| # | Sev | Gap | Layers | Where to see it | Fix |
|---|---|---|---|---|---|
| 1 | High | **Privacy and ownership.** The platform's promise is that users own their writing, yet v1 has no export, no account deletion, no data inventory, no privacy policy or terms. Emails are personal data. Nigeria's data protection rules apply [U: verify current NDPA requirements] | 31, 71, 58 | Section 3 (v1 list has neither) | Add export and delete-account to v1. Write a one-page data inventory and a simple policy |
| 2 | High | **No security logging or audit trail, and logs vanish.** Hobby keeps about 1 hour of runtime logs. Nothing records auth events or admin actions, so abuse or an incident cannot be investigated | 24, 53, 57 | Section 10 (gap noted, not designed) | Structured logs with request IDs, an audit table in Postgres for admin and auth events, one free error tracker [U: verify free plan] |
| 3 | High | **Email provider undecided.** Password reset, email verification and email-bombing protection all depend on it | 14, 22, 58 | Section 14 | Choose and research one provider before work package 2 |
| 4 | High | **Silent lost updates.** Two tabs editing one draft: last save wins with no warning | 8, 3 | Section 7, save draft | Compare-and-set: a save must name the revision it was based on; mismatch is rejected with a clear message. Add a parallel-save test |
| 5 | Med | **Input limits and other render surfaces.** No maximum body or title length, no request size caps. Only the Markdown body is covered for XSS; titles in page titles, RSS, OpenGraph tags and the admin screen are not. `javascript:` links are unaddressed | 16, 20, 22 | Sections 8 and 9 | CHECK constraints and Zod limits; encode output in every surface; extend the XSS suite to them |
| 6 | Med | **No environments, region unspecified.** No dev, staging and production separation. Function and database region not chosen, which matters for latency on serverless | 49, 12, 28 | Sections 4 and 12 | Use Neon branches for staging (10 branches on the free plan [V Neon FAQ]); pick one region for both; write an environment table |
| 7 | Med | **No timeouts, retries or idempotency.** Neon cold starts add 300 to 500 ms [V]. Nothing says what happens when a request exceeds the platform's function limit [U: check current limit] | 34, 35, 45 | Section 10 | Set timeouts below the platform limit; make publish idempotent; one retry layer only |
| 8 | Med | **No SLOs, no capacity test.** Targets exist but no measured service levels, and the load estimate is arithmetic only | 33, 42, 37, 43 | Sections 3 and 10 | Define 2 or 3 SLIs, run one baseline load test, record the first bottleneck |
| 9 | Med | **Admin and project governance.** An admin role exists but moderation, audit and takedown flows are undesigned. No SECURITY.md, no branch protection, no MFA plan on GitHub, Vercel and Neon, which are single points of failure | 57, 27, 70, 11 | Sections 6 and 10 | Add admin audit log, a SECURITY.md stub, branch protection, MFA on all three accounts |
| 10 | Med | **Browser security headers.** Only CSP nonces are listed. HSTS, nosniff, frame protection, referrer policy and open-redirect protection on auth callbacks are missing | 19, 21 | Section 9 | Header set in config; scan the deployed HTML in CI or at launch |

## 3. Quick wins (each under an hour of design)

1. Add export and delete-account to the v1 list.
2. Add length CHECK constraints and matching Zod limits.
3. Add the compare-and-set rule to the save flow.
4. Choose one region for Vercel and Neon.
5. Add a state diagram for posts (draft, published, deleted) with allowed transitions.
6. Add "how we will know this was wrong" and a revisit date to every decision record.
7. Write a SECURITY.md stub and turn on branch protection and MFA.

## 4. Layer-by-layer table

| # | Layer | Status | Note |
|---|---|---|---|
| 1 | Problem, users, metrics | A | Job statement and users exist; no success metrics |
| 2 | Requirements and tests | A | Targets exist; no requirement-to-test map |
| 3 | Domain model, state machine | A | Invariants yes; transitions not defined |
| 4 | Abuse cases | A | Threat table only; no per-journey abuse cases |
| 5 | Boundaries and modularity | D | Rules plus bad-import test. Add: swap-a-dependency test |
| 6 | Data model and integrity | D | Constraints, UUIDs, indexes. Add: EXPLAIN plans, timestamptz |
| 7 | API and contracts | A | One result shape, pagination; no idempotency, no route inventory |
| 8 | State and concurrency | D | Transactions plus parallel test. Gap: concurrent draft edits (gap 4) |
| 9 | Decision records | A | Index of 13; missing "how we'd know it was wrong", revisit date |
| 10 | Dependencies and vendors | A | Limits researched; no vendor file with exit paths |
| 11 | SPOFs and circular dependencies | A | Listed; no mitigation or acceptance per item |
| 12 | Configuration as code | A | Fail-fast validation; no last-known-good, no bad-config drill |
| 13 | Threat model | A | 7 threats; no assets, trust boundaries or privacy threats |
| 14 | Authentication | A | Better Auth chosen; enumeration, timing and reset unverified or undefined |
| 15 | Authorization | D | Deny by default, ownership checks, matrix test. Add: route inventory in CI |
| 16 | Validation and output handling | D | Zod and XSS suite. Gap: limits, other surfaces (gap 5) |
| 17 | Sessions and tokens | A | DB sessions, revocation noted; cookie flags and tests undefined |
| 18 | Keys and secrets | A | Env validation and scan; no rotation drill, no per-environment secrets |
| 19 | Transport and headers | A | CSP only (gap 10) |
| 20 | Outbound requests and files | N/A | No uploads or server-side fetches in v1. Revisit with image upload |
| 21 | Supply chain | A | Audit, frozen lockfile, version-age rule; no provenance or install-script review |
| 22 | Abuse and cost limits | A | Three layers; no size caps, no email limits, no signup-abuse plan |
| 23 | Vulnerability-class elimination | A | Strict types, Zod; no banned-pattern lint rules or proof |
| 24 | Security logging and audit | M | See gap 2 |
| 25 | AI and LLM safety | N/A | Product has no AI |
| 26 | Agentic safety | N/A | Product has no agents |
| 27 | Vulnerability disclosure | M | No SECURITY.md or process |
| 28 | Persistence and migrations | A | Driver choice researched; no pooled vs direct URL, no expand/contract |
| 29 | Backup and restore | A | Gap found and drill planned; no written RPO or RTO, no mechanism |
| 30 | Data integrity | D | Constraints, append-only, soft delete. Add: admin audit trail |
| 31 | Privacy and deletion | M | See gap 1 |
| 32 | Data provenance | N/A | User content; terms belong to layer 71 |
| 33 | SLIs and SLOs | M | See gap 8 |
| 34 | Timeouts | M | See gap 7 |
| 35 | Retries and idempotency | M | See gap 7 |
| 36 | Circuit breakers | M | One dependency; likely an accepted risk, write it down |
| 37 | Overload protection | A | Firewall rule and limiter; nothing tested past capacity |
| 38 | Graceful degradation | A | Behaviours listed; no drills, no user messages defined |
| 39 | Fail-open or closed matrix | A | Partial; what the rate limiter does when its store fails is undefined |
| 40 | Static stability | A | SPOFs named; no accepted-risk statements |
| 41 | Blast radius | A | No feature kill switch without a deploy |
| 42 | Capacity and load testing | M | See gap 8 |
| 43 | Cascading failures | M | Cache stampede and cold-start storms not analysed |
| 44 | Chaos and game days | A | Two drills planned; no game day |
| 45 | Startup, health, cold starts | A | Cold start noted; readiness checks undefined |
| 46 | CI quality gates | D | Broad list. Add: licence check, end-to-end smoke |
| 47 | Progressive delivery | M | Preview deployments and staged rollout not in the design |
| 48 | Rollback and reversibility | A | Rollback drill planned; expand/contract not stated |
| 49 | Environments | M | See gap 6 |
| 50 | Release management | M | No versioning or changelog policy |
| 51 | Change risk review | N/A | T3 layer |
| 52 | Platform hygiene calendar | M | No expiry calendar for domain, keys, secrets |
| 53 | Observability | A | Gap noted, nothing designed (gap 2) |
| 54 | Alerting | M | No alerts or owner |
| 55 | Runbooks and break-glass | M | None |
| 56 | Incident response | M | None |
| 57 | Administration | A | Role exists; no audit, moderation or kill switch |
| 58 | User recovery and support | M | Depends on email (gap 3); no abuse reporting |
| 59 | Cost and capacity governance | D | Free-tier ceilings mapped with behaviour at the limit. Add: 10x traffic simulation |
| 60 | Documentation | A | Architecture and decision records planned; no README, runbooks, SECURITY |
| 61 | Launch readiness review | A | Named in work package 9; checklist not written |
| 62 | Test strategy | A | Test types named; no pyramid |
| 63 | Test integrity | A | Real-Postgres tests planned; regression-test rule not stated |
| 64 | Frontend resilience | A | Lighthouse target only; no slow-network or error-state tests |
| 65 | Accessibility and inclusion | A | WCAG 2.2 AA target; no plan for real users' language or devices |
| 66 | Product honesty | M | No rule against placeholder screens or unverified claims |
| 67 | Code quality | A | Strict TypeScript and lint; no newcomer or fresh-agent test |
| 68 | Performance engineering | A | Indexes and pagination; caching rules unresearched |
| 69 | Delivery metrics | M | Likely low value for one developer; accept explicitly |
| 70 | Project governance | A | Terms checked; no branch protection, owners or MFA |
| 71 | Compliance and legal | M | See gap 1 |
| 72 | Independent validation | A | Blind review planned; not yet requested |
| 73 | Continuous improvement | M | No doc-drift checks or re-score schedule |
| 74 | People and operability | A | Single developer acknowledged; no operating notes |

## 5. Unverified items carried from the design

Better Auth enumeration, timing and CSRF defaults · dependency-cruiser same-module capture-group syntax · drizzle-kit with several schema files · Express on Vercel (dropped, no longer needed) · Upstash free tier · Next.js 16 caching approach · current function duration limit on Hobby · Nigerian data protection requirements · free error-tracking plan terms · most research sources are blogs, not standards. Neon free storage is 1 GB per Neon's own page; some third-party sources say 0.5 GB.

## 6. Why this score may be generous or harsh

1. **Generous:** the builder graded its own work, and several "designed" layers rely on tools not yet run.
2. **Generous:** tier T2 was assumed. If Mr Tobi says the platform serves company business, or it grows to hold more data, the tier and the missing layers change.
3. **Harsh:** the 3.8% is a mechanical result of scoring a design as if it were a system. For a free-tier, 200-user, single-developer project, some missing layers (circuit breakers, delivery metrics, release management) are better recorded as accepted risks than built.

## 7. For the independent reviewer

Check first: (a) whether export and delete-account are really absent from v1; (b) whether the claimed Hobby log retention and Neon limits match the providers' own pages today; (c) whether the XSS suite plan covers every place user text appears.

## 8. Thirty-minute check you can run alone

1. Open the design document, search for "export" and "delete". Confirm gap 1.
2. Open Vercel's Hobby plan page and read the log retention line. Confirm gap 2.
3. Open Neon's free-plan FAQ and confirm the 1 GB storage and 10-branch figures used for gaps 6 and the storage ceiling.

## 9. Most valuable next action

Settle the open choices that block work package 2: **the email provider and the privacy scope (export, delete, data inventory)**. They affect the data model and authentication, which are the layers you build first.
