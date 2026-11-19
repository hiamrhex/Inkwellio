# ADR-004: Drizzle ORM

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

The schema is constraint-heavy and the queries should stay inspectable. A
single developer will review every migration.

## Decision

Use Drizzle for schema definition, queries, and migrations.

## Options considered

| Option | Strengths | Why not chosen |
| --- | --- | --- |
| Drizzle | SQL-shaped API, typed results, readable SQL migrations | — |
| Prisma | Mature tooling, generated client | Schema language and engine add indirection; migration SQL is less visible |
| Kysely | Excellent query builder | No schema/migration workflow of its own |
| Raw SQL | Maximum control | Type safety and refactor support are manual |

## Consequences

- Queries remain close to SQL, which matters for partial indexes and
  full-text search.
- Per-module schema files are collected by one glob, proven on 19 November 2026
  (E-028, E-029): `schema: ['./src/modules/*/schema.ts']` picked up every module
  directory, a module schema imported another module's table through its
  `index.ts` with the `@/` alias and the foreign key was emitted, and a glob
  that matches nothing is a hard error (exit 1) rather than a silent empty
  migration. `drizzle-kit generate` needs no database, so CI can prove the
  collection without Postgres.
- Pinned versions: `drizzle-kit` 0.31.11 (published 2026-09-21) and
  `drizzle-orm` 0.45.4 (published 2026-10-08), both outside the 14-day window.
- Migrations are reviewed by hand; no automatic production migration step is
  approved yet.
- Type inference from schema reduces duplicate type declarations, but Zod
  remains the input-validation boundary.
