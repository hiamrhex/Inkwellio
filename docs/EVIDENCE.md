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
| E-022 | E34 | Hobby function maximum duration is **300 s** | docs read | vercel.com/docs/plans/hobby (updated 2026-11-12) | 2026-11-18 | confirmed |
| E-023 | B5 | Hobby deploys functions to a **single** region; default is `iad1`; `regions` accepts one value on Hobby | docs read | vercel.com/docs/functions/configuring-functions/region | 2026-11-18 | confirmed |
| E-024 | B5 | `lhr1` = AWS `eu-west-2`, London | docs read | vercel.com/docs/regions | 2026-11-18 | confirmed |
| E-025 | E40 | Neon regions include `aws-eu-west-2` (London); a project's region is fixed at creation and cannot be changed | docs read | neon.com/docs/introduction/regions (updated 2026-10-14) | 2026-11-18 | confirmed |
| E-026 | C21 | Secret scanning runs **automatically and free on public repositories**, over full history and issues/PRs | docs read | docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning | 2026-11-19 | confirmed |
| E-027 | I27 | A **public** repository can enable private vulnerability reporting; reports are private, and the report form can require a CWE | docs read | docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository | 2026-11-19 | confirmed |
| E-028 | B5 | `drizzle-kit` 0.31.11 collects **every** module's `schema.ts` from one glob (`./src/modules/*/schema.ts`). Run 1: 3 tables from 2 directories, with `CHECK`, `UNIQUE`, `ON DELETE cascade` and a btree index all emitted. Run 2: a module schema importing another module's table through that module's `index.ts` via the `@/*` tsconfig alias resolved, and the FK was emitted. `generate` needs no database, so CI can prove this without Postgres | `pnpm exec drizzle-kit generate` in a scratch project (`%TEMP%\opencode\u1`); outputs `migrations/0000_stale_maddog.sql`, `migrations2/0000_slim_gateway.sql` | run 1: `alpha_one` 3 cols, `alpha_two` 1 fk, `beta_one` 1 index; run 2: `alpha_one` 3 cols, `beta_one` 4 cols / 1 index / 1 fk | 2026-11-19 | **confirmed** |
| E-029 | B5 | A `drizzle-kit` schema glob that matches nothing is a **hard error** (exit 1, "No schema files found for path config"), not a silent empty migration | same project, glob changed to `./src/modules/*/nope.ts` | `Error  No schema files found …`; exit=1; no output directory created | 2026-11-19 | **confirmed** |
| E-030 | F46 | `pnpm install` runs the lifecycle chain **`preinstall, install, postinstall, preprepare, prepare, postprepare`** for each project in the workspace; `--prod` runs only the first three | docs read | pnpm.io/scripts, "Lifecycle scripts" | 2026-11-19 | confirmed |
| E-031 | F46 | `core.hooksPath` redirects hooks; a hook without the executable bit is ignored; `post-commit` cannot change the commit's outcome; a non-zero `pre-push` aborts the push | docs read | git-scm.com/docs/githooks | 2026-11-19 | confirmed |
| E-032 | F46 | Hooks are live on this machine: `core.hooksPath=.githooks`, both files mode **100755** in the index, `text: set` / `eol: lf` from `.gitattributes`, `git hook run post-commit` → exit 0 (Git 2.52.0.windows.1) | `git config --get core.hooksPath`; `git ls-files -s .githooks`; `git check-attr text eol`; `git hook run post-commit` | `100755 … .githooks/pre-push`; `eol: lf`; exit 0 | 2026-11-19 | **confirmed** |

## Stale markers

Rows citing provider docs remain valid until the provider changes them. Re-check E-004…E-009 and E-015…E-017
before launch (WP9), because every one of them is a ceiling this design is engineered around.

## Unverified (kept here as well as in AUDIT §5)

- ~~U-1 `drizzle-kit` glob over per-module schema files.~~ Closed 19 Nov 2026: E-028, E-029 (the glob
  collects every module, cross-module FKs resolve through `index.ts`, and an empty glob is a hard
  error).
- U-2 Better Auth × Next 16 `proxy.ts` compatibility; enumeration/timing behaviour; cookie-cache revocation.
- U-3 **SMTP egress from Vercel Functions** — no evidence yet that port 587/465 is allowed or unthrottled.
- U-4 Neon "Managed Better Auth" (60k MAU listed on the free plan) — contents and lock-in unknown.
- U-5 Neon CU-hour consumption under real caching — arithmetic only, no measurement.
- U-6 Enforcement of Hobby "personal use" for a public multi-user service.
- U-7 Standards versions in STANDARDS §5 are `[S]` (skill reference list), not re-opened.
- U-8 The plan requirement for branch protection rules, required status checks and push protection on a
  **user-owned public** repository was not read this session. Enable them and record what the settings
  page offers at that moment (A12).
- U-9 MFA availability on the Vercel and Neon free plans was not re-read this session. Both are required
  at WP9 regardless; the plan check happens when the setting is opened (A12).
