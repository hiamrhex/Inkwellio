# EVIDENCE LEDGER

Append-only. One row per claim. No secrets recorded. Host: local Windows, `C:\Users\HP\Projects\Inkwellio`.
Date column is the date the evidence was captured, not the date the source was published.

| ID | Layer | Claim | Method | Output / link | Date | Result |
| --- | --- | --- | --- | --- | --- | --- |
| E-001 | B5 | Next 16 renames `middleware` → `proxy`; file runs on Node.js runtime by default; `runtime` option throws | docs read | nextjs.org/docs/app/api-reference/file-conventions/proxy | 2026-11-18 | confirmed |
| E-002 | C15 | Official guidance: verify auth inside every Server Function, never rely on Proxy alone | docs read | same page, "Execution order → Good to know" | 2026-11-18 | confirmed |
| E-003 | F46 | `next lint` removed in Next 16; `next build` no longer lints; Node ≥ 20.9, TS ≥ 5.1; `@next/eslint-plugin-next` defaults to flat config | docs read | nextjs.org/blog/next-16, Breaking changes | 2026-11-18 | confirmed |
| E-004 | G59 | Hobby: 1M invocations, 100 GB fast data transfer, 10 GB origin transfer, 4 CPU-hrs, 1 h runtime logs, 100 deploys/day, 3 WAF custom rules, 10 IP blocks | docs read | vercel.com/docs/plans/hobby | 2026-11-18 | confirmed |
| E-005 | C22 | Hobby WAF rate limiting: 1 rule per project, keys IP + JA4 only, fixed window, 10 s–10 min | docs read | vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting | 2026-11-18 | confirmed |
| E-006 | G54 | Hobby cron: 100 jobs, **once per day only**, timing ±59 min | docs read | vercel.com/docs/schedules/cron-jobs/usage-and-pricing | 2026-11-18 | confirmed |
| E-007 | E40 | Neon free: 100 projects, 10 branches, **100 CU-hrs/project/month**, 1 GB storage (20 GB account), 5 GB public transfer, 6 h restore capped at 1 GB change history, 1 snapshot | docs read | neon.com/faqs/free-plan-limits-and-quotas (updated 2026-11-03) | 2026-11-18 | confirmed |
| E-008 | E38 | Neon quota exhaustion: compute suspended until next billing period; existing connections drop, new ones cannot open | docs read | same page, "What happens when you hit a limit" | 2026-11-18 | confirmed |
| E-009 | I70 | Hobby ToS §4: "only ... personal or non-commercial use"; may disable/remove projects with or without notice, incl. for performance problems caused by malicious attack | terms read | vercel.com/legal/terms (2026-10-19) | 2026-11-18 | confirmed |
| E-010 | G59 | Resend free: 3,000 emails/mo, 100/day, 3 verified domains, DKIM/SPF/DMARC | docs read | resend.com/pricing | 2026-11-18 | confirmed (superseded by brief: Gmail SMTP chosen) |
| E-011 | C16 | react-markdown safe by default; HTML escaped unless `rehype-raw`; `rehype-sanitize` after plugins | readme read | github.com/remarkjs/react-markdown | 2026-11-18 | confirmed |
| E-012 | B5 | `neon-http` cannot do interactive transactions; WS (`neon-serverless`) can; Node needs `ws`+`bufferutil` | docs read | orm.drizzle.team/docs/connect-neon | 2026-11-18 | confirmed |
| E-013 | C14 | Better Auth: 10 s/100 default, `/sign-in/email` 3 per 10 s, `auth.api` calls **not** rate limited, database storage supported, `consume` must be atomic | docs read | better-auth.com/docs/concepts/rate-limit | 2026-11-18 | confirmed |
| E-014 | C14 | Better Auth reads `x-forwarded-for` by default; fixes are `ipAddressHeaders`, `trustedProxies`, or `[]` | docs read | same page | 2026-11-18 | confirmed |
| E-015 | C14 | **Vercel overwrites `x-forwarded-for` and does not forward external IPs, to prevent spoofing; `x-vercel-forwarded-for` is identical but survives a proxy in front** | docs read | vercel.com/docs/headers/request-headers | 2026-11-18 | confirmed — **corrects my earlier "spoivable by default" claim** |
| E-016 | G59 | Vercel Blob Hobby: 1 GB storage, 10 GB transfer, 10k simple ops, 2k advanced ops/month | docs read | vercel.com/docs/vercel-blob/usage-and-pricing | 2026-11-18 | confirmed |
| E-017 | E38 | Next 16 caching: `cacheComponents` + `partialPrefetching`, `use cache`, `cacheLife`, `updateTag()` for read-your-writes, `revalidateTag(tag, profile)`; prefetch costs one invocation per link | docs read | nextjs.org/docs/app/getting-started/caching | 2026-11-18 | confirmed |
| E-018 | F46 | Local toolchain present: Node 24.12.0, npm 11.6.2, **pnpm 12.21.0 installed this session**, Docker 29.4.3, git 2.52.0 | `node -v; npm -v; pnpm -v; docker -v` | command output | 2026-11-18 | confirmed |
| E-019 | I70 | Repository state: zero commits, branch `main`, remote `origin` set, working tree contains only untracked `docs/` | `git status --short --branch` | `## No commits yet on main...origin/main [gone]` | 2026-11-18 | confirmed |
| E-020 | — | `WP0-agent-brief.md` is absent from this machine (filename search depth 4 + content grep for "WP0" across all `*.md`) | `Get-ChildItem -Recurse -Filter *brief*`; grep `WP0` | no matches outside this audit's own files | 2026-11-18 | confirmed absent |
| E-021 | — | The Claude artifact URL returns no readable content to an unauthenticated fetch (two attempts) | `webfetch` text + markdown | body: "Claude Artifact Content is user-generated and unverified." | 2026-11-18 | blocked |

## Stale markers

Rows citing provider docs remain valid until the provider changes them. Re-check E-004…E-009 and E-015…E-017
before launch (WP9), because every one of them is a ceiling this design is engineered around.

## Unverified (kept here as well as in AUDIT §5)

- U-1 `drizzle-kit` glob over per-module schema files.
- U-2 Better Auth × Next 16 `proxy.ts` compatibility; enumeration/timing behaviour; cookie-cache revocation.
- U-3 **SMTP egress from Vercel Functions** — no evidence yet that port 587/465 is allowed or unthrottled.
- U-4 Neon "Managed Better Auth" (60k MAU listed on the free plan) — contents and lock-in unknown.
- U-5 Neon CU-hour consumption under real caching — arithmetic only, no measurement.
- U-6 Enforcement of Hobby "personal use" for a public multi-user service.
- U-7 Standards versions in STANDARDS §5 are `[S]` (skill reference list), not re-opened.
