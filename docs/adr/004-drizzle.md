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
- Per-module schema files must be collected by `drizzle-kit`; this is
  unverified and must be proven in WP1.
- Migrations are reviewed by hand; no automatic production migration step is
  approved yet.
- Type inference from schema reduces duplicate type declarations, but Zod
  remains the input-validation boundary.
