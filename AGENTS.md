# Agent instructions

## Git workflow

Owner rule, 19 November 2026: **never leave more than two unpushed commits.**

1. Commit when the change is coherent and `pnpm check` passes. One logical
   change per commit.
2. Push at the end of every work unit, and never leave more than two unpushed
   commits. `main` tracks `origin/main`.
3. If the push fails, retry once. If it fails again, stop and report the exact
   error. Do not stack more commits on an unpushed one.
4. **Never force-push. Never use `--no-verify`.** The hooks are the local gate,
   and CI is the backstop that cannot be skipped.
5. Never commit `.env` or any secret.

This supersedes both the WP0 brief's "commit locally, never push" and the
18 November "push after every commit" rule.

## Hooks

`.githooks/` is committed and installed as `core.hooksPath`.

- `post-commit` pushes when a second commit is waiting. It cannot fail a
  commit, and it never forces.
- `pre-push` refuses a non-fast-forward update of `main`, scans with gitleaks
  when the pinned binary is on PATH, then runs `pnpm check`. A non-zero exit
  aborts the push.

Install happens automatically through `prepare` on `pnpm install`. The manual
fallback is `pnpm hooks:install` (`--force` if `core.hooksPath` was set
elsewhere). Hooks are local and bypassable, which is exactly why CI re-runs the
same gates on every push.

## Before committing

Run `pnpm check`: lint, typecheck, tests, seam check, production build. A push
to `main` also runs `.github/workflows/ci.yml`.
