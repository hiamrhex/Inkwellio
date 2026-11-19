# Codebase tour

Written for someone who knows Express. Inkwellio does the same jobs — routes, controllers, services,
models — but a different framework arranges the files, and the arrangement is enforced by a test rather than
by habit.

## The short version

| Express habit | Here | Why |
| --- | --- | --- |
| `app.js` | `apps/web/src/app/` | Next.js App Router. A folder is a URL. |
| `routes/*.js` | `app/<segment>/page.tsx`, `app/<segment>/route.ts` | `page.tsx` renders HTML; `route.ts` is a JSON endpoint (like an Express handler). |
| `controllers/*.js` | `modules/<name>/index.ts` | The only file another module may import. |
| `services/*.js` | everything else inside `modules/<name>/` | Private by convention, and by the seam rule. |
| `models/*.js` | `modules/<name>/schema.ts` | Drizzle table definitions; SQL comes from `drizzle-kit`. |
| `db.js` | `kernel/db.ts` | One pool, created lazily. |
| `middleware/*.js` | none yet (`proxy.ts` when headers and CSP arrive) | WP4. |
| `config.js` | `kernel/env.ts` | Zod-validated environment. |
| `index.js` (entry) | nothing to start by hand | `next build` + `next start`; Vercel runs the same build. |

## Why a monorepo

`pnpm-workspace.yaml` lists the packages. There is one deployable app and two libraries:

```
apps/web            the Next.js application (all product code)
packages/config     shared TypeScript and lint configuration
packages/ui         shared components (empty in v1 so far)
tools/              repository scripts: hook installer, seam rules
.githooks/          committed Git hooks (pre-push runs the full gate)
.github/workflows/  CI: install, gate, audit, secret scan
docs/               decisions, evidence, plan
```

Every package is installed into a single root `node_modules` (`nodeLinker: hoisted`) because Windows on
this machine refuses symlinks.

## The two words that matter

**`kernel/`** — infrastructure everybody uses and that is allowed to depend on nothing but libraries. It
holds `env.ts` (configuration), `errors.ts` (the public error vocabulary), `db.ts` (the pool), `log.ts`
(server logging), `sql.ts` (shared SQL fragments) and `schema.ts` (the audit and rate-limit tables, which
belong to no single feature).

**`modules/`** — the product, split by feature: `identity`, `publications`, `posts`, `topics`, plus `site`
and `search` placeholders.

The rule, enforced by `tools/seam-rules.cjs` through dependency-cruiser in `pnpm check`:

1. `app/` may import a module's `index.ts`, never its internals.
2. A module may import another module's `index.ts`, never its internals.
3. Modules may import `kernel/`.
4. `kernel/` may not import a module, and a module's internals may not form a cycle.

This is the Express `require('../services/whatever')` problem, caught before review. If you need something
from another feature, you add it to that feature's `index.ts` on purpose.

## A request, end to end

1. `app/page.tsx` (or a future `/@slug` route, served through a rewrite to an internal `/p/...` page) is the
   **route**. It is a Server Component: it runs on the server, never ships to the browser, and may be cached.
2. It calls a function exported from `modules/posts/index.ts` — the **controller**.
3. That function validates its input with Zod (`ValidationError` on failure), calls private helpers in the
   same folder — the **service layer** — and talks to Postgres through `kernel/db.ts`.
4. A failure inside is converted by `kernel/errors.ts` into a public code (`NOT_FOUND`, `CONFLICT`,
   `VALIDATION_ERROR`, `UNAVAILABLE`, `INTERNAL`). The raw database message never reaches the browser.
5. `app/error.tsx` renders a generic message and the framework's `error.digest`, so a user can quote one
   identifier and the server log can be searched for it.

## Tests

`apps/web/tests/` mirrors those concerns rather than the file tree:

- `boundaries.test.ts` — the seam rule, with fixture projects that must fail.
- `raw-html.test.ts` — the `dangerouslySetInnerHTML` ban.
- `env.test.ts` — configuration parsing.
- `errors.test.ts` — the mapping from real database errors to public codes.
- `disclosure.test.ts` — what must never appear in the client bundle or the HTML.
- `server-headers.test.ts` — starts the production server and reads real response headers.
- `db/postgres.test.ts` — schema behaviour against a real Postgres 17 (skipped without `DATABASE_URL`,
  hard-failing when CI is set without one).

## Database changes

1. Edit `modules/<name>/schema.ts`.
2. `pnpm --filter @inkwellio/web exec drizzle-kit generate` writes SQL into `apps/web/drizzle/`.
3. Read the SQL. Commit it. Migrations are expand-only: add a column, backfill, then contract in a later
   release.

`db:migrate` applies them; CI applies them to an empty database on every push.

## The gate

`pnpm check` is the whole contract: lint, typecheck, build, tests, seam check. `.githooks/pre-push` runs it
before anything leaves the machine, and CI runs it again where it cannot be bypassed. If a check fails, the
change is not ready — the check is never the thing to adjust.
