# Agent instructions

## Git workflow

Owner rule, 18 November 2026: **push after every commit.**

1. Commit when the change is coherent and `pnpm check` passes.
2. Push immediately — `main` tracks `origin/main`:
   `git push`
3. If the push fails, retry once. If it fails again, stop and report the exact
   error. Do not stack more commits on an unpushed one.
4. Never force-push. Never commit `.env` or any secret.

This supersedes the WP0 brief's "commit locally, never push", which was in
force until the owner changed it.

## Before committing

Run `pnpm check`: lint, typecheck, tests, seam check, production build.
A push to `main` also runs `.github/workflows/ci.yml`.
