# Architecture

Status: WP0 (repo and rails). No database, auth, or feature code exists yet.

Source of truth: [Blog Platform Architecture and System Design](https://claude.ai/artifact/REChTt6t3FroWDZ3gW8fc9).
Owner-approved changes are recorded in [design-amendments.md](./design-amendments.md).
Delivery order and risks are in [PLAN.md](./PLAN.md) and [AUDIT.md](./AUDIT.md). The received design
audit is [design-audit-2026-11-18.md](./design-audit-2026-11-18.md); its findings are triaged at the
top of [design-amendments.md](./design-amendments.md).

## Shape

One deployable Next.js application, with the backend inside it. Code is split
into feature modules that own their future schema, validation, logic, actions,
and UI. Modules talk through public entry points only.

```text
apps/web/src/
  app/            routes; thin composition only
  modules/        identity, publications, posts, topics, search, site
    <module>/     index.ts is the only public entry point
  kernel/         env, errors; later db, logger, rate limit
packages/
  ui/             shared UI primitives; no business logic
  config/         shared build-independent constants
docs/adr/         decisions
```

The app has no runtime dependency on a workspace package yet. `packages/ui`
and `packages/config` are present so later work can move shared code without
reshaping the repo.

## Boundaries

`dependency-cruiser` enforces:

1. `app/` imports a module only through that module's `index.ts`.
2. Modules import other modules only through their `index.ts`; imports inside
   the same module are unrestricted. This uses regex group matching (`$1`).
3. `kernel/` imports nothing from `modules/`.
4. No circular dependencies.
5. TODO for WP2: only `modules/identity/` may import Better Auth.

Run `pnpm check:boundaries`. CI also runs it.

The rule text exists once, in `tools/seam-rules.cjs`. Both the shipped config
and `apps/web/tests/boundaries.test.ts` call `createSeamRules`, so the test
cannot drift into proving a copy. The test runs one clean fixture and one
failing fixture per rule, fails if a shipped rule has no fixture, and fails if
any fixture import does not resolve — a typo cannot make a rule look enforced.

`react/no-danger` is an ESLint error and
`apps/web/tests/raw-html.test.ts` proves the shipped config rejects
`dangerouslySetInnerHTML`. Raw HTML injection is the one XSS class that
bypasses React's escaping.

## Environment

`apps/web/src/kernel/env.ts` parses `process.env` with Zod when the module is
imported. An invalid or missing value throws at process start. `.env` is
git-ignored; `.env.example` is committed. Tests cover valid, missing, and
invalid values.

## Toolchain

Every dependency is pinned to an exact version published at least 14 days
before 18 November 2026. `minimumReleaseAge: 20160` (14 days, in minutes)
enforces the same rule for transitive dependencies at install time.

| Package | Version | Published |
| --- | --- | --- |
| Node.js | 24.12.0 | preflight runtime |
| pnpm | 12.17.0 | 2026-10-30 |
| next | 16.4.5 | 2026-11-03 |
| react / react-dom | 19.3.1 | 2026-10-14 |
| typescript | 5.9.3 | 2025-09-30 |
| eslint | 9.39.5 | 2026-07-10 |
| eslint-config-next | 16.4.5 | 2026-11-03 |
| tailwindcss | 4.3.4 | 2026-11-02 |
| @tailwindcss/turbopack | 4.3.4 | 2026-11-02 |
| zod | 4.6.7 | 2026-10-12 |
| vitest | 5.1.0 | 2026-11-02 |
| vite | 8.3.5 | 2026-10-21 |
| dependency-cruiser | 18.7.2 | 2026-11-02 |
| @types/node | 24.19.2 | 2026-10-09 |
| @types/react / @types/react-dom | 19.3.0 | 2026-09-09 |

Next 16.4.6 (2026-11-09) and pnpm 12.21.0 (2026-11-13) were excluded by the
14-day rule. Next 16.4.5 is also outside the vulnerable ranges of the known
Critical advisories fixed in 16.4.0 and 16.3.6.

TypeScript is pinned to the newest 5.x, not 7.x: Next 16 documents TypeScript
5.1+ only, and no official source confirms TypeScript 7 support.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install --frozen-lockfile` | reproducible install |
| `pnpm lint` | ESLint flat config over the repo |
| `pnpm typecheck` | `next typegen` plus `tsc --noEmit` in every package |
| `pnpm test` | Vitest, single run |
| `pnpm check:boundaries` | dependency-cruiser over `apps/web/src` and `packages` |
| `pnpm build` | production Next.js build |
| `pnpm check` | lint, typecheck, test, boundaries, build |

## Hooks

`.githooks/` is committed and activated by `core.hooksPath`, which
`tools/install-hooks.mjs` sets from the root `prepare` script (pnpm runs
`prepare` on every `pnpm install`; E-030) with `pnpm hooks:install` as the
manual fallback. Hooks without the executable bit are ignored, so the two
scripts are committed as mode `100755` (E-031).

- `post-commit` pushes when a second unpushed commit exists. It runs after the
  commit and cannot fail it.
- `pre-push` refuses a non-fast-forward update of `main`, runs gitleaks when the
  pinned binary is on PATH, then `pnpm check`. A non-zero exit aborts the push.

`.gitattributes` pins `.githooks/*` to LF: a CRLF shebang silently stops a hook
from running on Windows, and the failure is invisible. E-032 records the
installed mode, the attribute values, and `git hook run post-commit` returning
0, which is Git resolving the hook through `core.hooksPath`.

Hooks are local and can be bypassed; CI re-runs the same gates and cannot be.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests with
`contents: read`, installs with `--frozen-lockfile`, runs `pnpm check`, audits
production dependencies (`pnpm audit --prod --audit-level=high`), and scans
every commit in history with gitleaks (pinned binary, checksum verified).
Third-party actions are pinned to full commit SHAs.

Dev-only advisories are intentionally excluded from the audit gate: the
current high finding is a `picomatch` ReDoS reachable only through
`eslint-config-next`, and no patched release exists.

## Deployment and data (later work)

WP1 will add PostgreSQL. Integration tests will use a local Docker Postgres
container, not a shared or hosted database. Neon's free plan is the production
target, with the WebSocket driver for transactional writes. Public page
caching moves into WP1/WP4 because Neon compute suspension is the binding
availability risk (amendment A1). No platform-only APIs are introduced; hosting
stays portable while the Vercel Hobby terms question is open (amendment A5).

## Local Windows constraint

This machine denies symlink creation. pnpm therefore uses
`nodeLinker: hoisted` and `hoistWorkspacePackages: false`. The workspace
packages remain projects, but they are not symlinked into the root
`node_modules`. When a package must be consumed, use an injected dependency or
revisit this once Developer Mode is enabled.

## Decisions

See `docs/adr/`: 001 modular monolith, 002 Postgres, 003 Neon WebSocket driver,
004 Drizzle, 005 Better Auth, 006 one publication per user, 007 append-only
revisions with a moving published pointer, 008 Markdown, 009 TypeScript and Zod,
010 three-layer rate limiting, 011 `/@name` URLs, 012 curated topics and admin,
013 Vercel Hobby, 014 export and erasure. `docs/adr/README.md` carries each
record's falsifier and revisit date, plus the template for the next one.
