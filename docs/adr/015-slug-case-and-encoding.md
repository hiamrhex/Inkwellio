# ADR-015: Slugs are stored lowercase and enforced by CHECK, not `citext`

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** Richard Ilori
- **Revisit by:** 2027-02-19

## Context

A8 fixes the identifier rule: 1-64 characters, `[a-z0-9-]`, no leading,
trailing, or doubled hyphen. Three places have to agree on it — the create form,
the database, and the router that resolves `/@slug` — and the database is the
only one a bug cannot bypass.

The same question applies to `users.email`, which must be unique regardless of
case, and to every slug-bearing table: `publications`, `posts`, `topics`, and
both slug-history tables.

## Decision

Store identifiers lowercase and reject anything else with a named CHECK built
from one shared expression (`kernel/sql.ts`). Do not use `citext`, a trigger, or
application-only validation.

- The regex CHECK is duplicated into each table's DDL by `drizzle-kit`, so the
  invariant is visible in the migration and in `information_schema`.
- `users.email` gets the same treatment: `email = lower(email)` plus a shape
  check, so Better Auth cannot create two accounts that differ only by case.
- The router lowercases an incoming segment before lookup and redirects a
  mixed-case URL to its lowercase form (WP3). The index stays a plain b-tree.

## Options considered

| Option | Trade-off |
| --- | --- |
| CHECK + lowercase-only storage | Visible in the schema, no extension, rejects bad input instead of rewriting it |
| `citext` | Invisible folding: `A` and `a` become one value with no record of which was sent; an extension to verify on Neon; still needs a length CHECK |
| `lower(slug)` unique index | Folding without changing storage, but every query must remember to lowercase, and the column can still hold `Alice` |
| Trigger | Enforces it, but hides the rule from the migration and makes bulk loads harder to reason about |

## Consequences

- A mixed-case slug is a validation error at the boundary and a 400 from the
  database, never a silent rename.
- Unicode slugs are out of scope in v1; the charset is ASCII by construction.
- Case-insensitive lookups cost one lowercasing in the router. The primary key
  and unique indexes are unchanged.
- A future decision to allow uppercase must migrate data before it can relax a
  CHECK, which is the correct order.

## Overturned if

A writer's real content needs a non-ASCII or uppercase identifier, or the
redirect-from-mixed-case step shows up in the p95 (which would mean the router,
not the schema, is the wrong place for the fold).
