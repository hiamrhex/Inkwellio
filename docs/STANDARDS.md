# STANDARDS

Checks that matter for a T2, free-tier, solo-built publishing app. Each row: **WHY** it matters here and
**HOW** it will be verified. Status is honest: `[V]` checked against the vendor's own page on 18 Nov 2026,
`[S]` from the skill's reference list (researched 22 Oct 2026, not re-opened this session), `[U]` unverified.

Rule for this file: a standard with no verification method is decoration, so it is not listed.

## 1. Provider facts (the ceilings everything else is designed against)

| Fact | Value | Source | Status |
| --- | --- | --- | --- |
| Neon compute quota | 100 CU-hrs/project/month; ~400 h at 0.25 CU | neon.com/faqs/free-plan-limits-and-quotas | `[V]` |
| Neon exhaustion behaviour | compute suspended; existing connections drop, new ones cannot open | same | `[V]` |
| Neon storage / egress | 1 GB storage; 5 GB public network transfer per project/month | same | `[V]` |
| Neon recovery | 6 h instant restore, capped at 1 GB change history; 1 manual snapshot | same | `[V]` |
| Neon branches | 10 per project (test databases) | same | `[V]` |
| Vercel Hobby | 1M invocations, 100 GB fast data transfer, 4 CPU-hrs, 1 h runtime logs, 100 deploys/day, **300 s max function duration**, **single function region** | vercel.com/docs/plans/hobby; vercel.com/docs/functions/configuring-functions/region | `[V]` |
| Vercel Hobby ToS | "personal or non-commercial use"; may remove projects with or without notice | vercel.com/legal/terms §4 | `[V]` |
| Vercel WAF rate limiting on Hobby | 1 rule, keys = IP and JA4 only, fixed window, 10 s–10 min | vercel.com/docs/.../rate-limiting | `[V]` |
| Vercel Cron on Hobby | once per day only, timing ±59 min, 100 jobs | vercel.com/docs/schedules/cron-jobs/usage-and-pricing | `[V]` |
| Vercel Blob on Hobby | 1 GB storage, 10 GB transfer, 2,000 advanced ops/month | vercel.com/docs/vercel-blob/usage-and-pricing | `[V]` |
| Vercel request IP headers | platform **overwrites** `x-forwarded-for` and does not forward external IPs; `x-vercel-forwarded-for` is identical but survives a proxy in front | vercel.com/docs/headers/request-headers | `[V]` |
| Gmail SMTP | ~500 recipients/day, app password requires 2FA | — | `[U]` (per brief amendment 4, not re-checked) |

## 2. Framework and library facts

| Fact | Why it changes the design | Status |
| --- | --- | --- |
| Next 16 renames `middleware.ts` → `proxy.ts`, `proxy` runs on **Node.js runtime** by default, `runtime` option throws | §4's diagram must not imply edge execution | `[V]` nextjs.org/docs/app/api-reference/file-conventions/proxy |
| Next docs: "Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone" | makes §8's "proxy is optimistic only" official guidance, not just CVE-driven | `[V]` same page |
| `next lint` removed in 16; `next build` no longer lints; Node 20.9+, TS 5.1+ | CI must call ESLint directly | `[V]` nextjs.org/blog/next-16 |
| Cache Components: `cacheComponents: true` + `partialPrefetching: true`; `updateTag()` for read-your-writes; `revalidateTag(tag, profile)` requires the profile | resolves the doc's open caching question | `[V]` nextjs.org/docs/app/getting-started/caching |
| Partial prefetching costs one server invocation per prefetchable link | prefetching multiplies Neon wake-ups, i.e. spend against the compute quota | `[V]` same |
| `neon-http` cannot do interactive transactions; WS driver can | justifies the driver choice in §4 | `[V]` orm.drizzle.team/docs/connect-neon |
| react-markdown is safe by default; HTML escaped unless `rehype-raw`; `rehype-sanitize` if plugins | the N1 XSS control rests on this | `[V]` github.com/remarkjs/react-markdown |
| Better Auth: 10 s/100 req default, `/sign-in/email` 3 per 10 s, **`auth.api` calls are not rate limited**, storage `database` supported, `consume` must be atomic | §9's controls are real but need configuration | `[V]` better-auth.com/docs/concepts/rate-limit |
| Better Auth defaults to `x-forwarded-for`, with `ipAddressHeaders` / `trustedProxies` as the supported fixes | combined with Vercel overwriting XFF, the default is **acceptable here**; pin `x-vercel-forwarded-for` to survive a future proxy | `[V]` both pages |
| Next 16 async `params`/`searchParams`/`cookies`/`headers`; parallel routes need `default.js` | affects every route signature in WP3–WP6 | `[V]` nextjs.org/blog/next-16 |
| `drizzle-kit` collecting per-module schema files | blocks WP1 if wrong | `[U]` |

## 3. Checks this system must pass, by layer

| # | Layer | Check | Why here | Verified by | Status |
| --- | --- | --- | --- | --- | --- |
| 5 | Boundaries | Bad import fails CI; no module imports another's internals | N7 is otherwise unfalsifiable | one deliberately wrong import + red CI | planned |
| 6 | Data model | Unique publication per owner; slug unique per publication; published ⇒ pointer non-null; pointer ∈ own revisions | illegal states become unrepresentable | constraint tests on real Postgres (Docker) | planned |
| 8 | Concurrency | Two parallel saves cannot both win; 50 parallel publication creations yield one row | draft loss is the product's worst failure | parallel-request test | planned |
| 11 | SPOF | Every provider listed with mitigation or written acceptance | solo/free tier concentrates risk | register in FAILURE_MODES | planned |
| 12 | Config | Env validated at boot, fail fast; no secrets in bundle | standard serverless footgun | boot with missing/invalid env must refuse to start | planned |
| 14 | Authentication | Generic errors, equal timing, per-IP **and** per-account limits, spoofed-header test | credential stuffing is the default attack on a login form | brute-force script that rotates `x-forwarded-for` | planned |
| 15 | Authorization | Full matrix: every route × {anon, A, B, admin}; deny by default | top real-world risk | matrix harness + route inventory that fails on unprotected route | planned |
| 16 | Injection / XSS | Payload suite through the real render path; no `dangerouslySetInnerHTML` | user markdown is the main input | suite + lint ban | planned |
| 22 | Abuse & cost | Limits on signup, login, OTP send (per email + per IP), publish; WAF rule | Gmail 500/day is a hard external ceiling | 429 tests + header assertions | planned |
| 24 | Security logging | Auth events logged; no secrets/PII in logs or error tracker | 1 h log retention means the log must be right first time | send a token in a query string, inspect output | planned |
| 29 | Backup/restore | One restore performed and timed | N4 is unmeetable without a path | drill record with timestamps | planned |
| 34 | Timeouts | Every outbound call bounded, inner < platform limit | a slow DB should not become a 300 s hang | inject latency, assert clean error | planned |
| 38/39 | Degradation | Written fail-open/closed matrix; public reads serve cached, writes fail closed | quota exhaustion is a realistic outage | drill: revoke DB credentials in a preview | planned |
| 46 | CI gates | lint, types, tests, build, audit, secret scan, boundary, authz matrix, XSS, Lighthouse, migration check | the only thing that stops regressions at bus factor 1 | red-CI proof per gate | planned |
| 53 | Observability | Request IDs, structured logs, one error sink | Hobby keeps 1 h | follow one error end to end | planned |
| 62/63 | Tests | Tests on the real engine (Postgres container), regression test per fixed bug | in-memory SQLite would hide constraint behaviour | CI job using `postgres:17` service | planned |
| 65 | Accessibility | WCAG 2.2 AA on key pages | `[S]` WCAG 2.2; readers are the audience | axe + keyboard-only pass | planned |
| 71 | Compliance | Privacy policy, export, delete-account | NDPA + GDPR-minimum for an EU-reachable site | deletion test that greps every table for residue | planned |

## 4. Standards consulted but deliberately out of scope

- OWASP ASVS 5.0 `[S]` — full L2 conformance is a several-week audit of a system that does not exist.
  The subset above is the L2-relevant part for this architecture.
- OWASP Top 10 for LLM / Agentic Applications `[S]` — not applicable: no model in the system.
- SLSA build provenance, SBOM `[S]` — disproportionate for a solo free-tier app; dependency audit + lockfile
  is the honest level, recorded as an accepted gap.
- SOC 2 / ISO 27001 — not applicable.

## 5. Unconfirmed standard versions

The skill's reference list (22 Oct 2026) names ASVS 5.0, OWASP Top 10:2025, LLM Top 10 2025, Agentic 2026,
NIST SSDF 800-218 v1.1, SLSA v1.2, WCAG 2.2. None were re-opened this session; none changed a decision in
this audit, so the list stands as `[S]` rather than `[V]`.
