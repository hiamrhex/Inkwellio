# ADR-009: TypeScript and Zod

- **Status:** Proposed
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

One developer, one language across client and server, and untrusted input at
every boundary (forms, Server Actions, route handlers, environment variables).

## Decision

Use strict TypeScript everywhere. Validate every external input with Zod at the
boundary and infer types from the schema. Environment variables are parsed at
startup.

## Options considered

| Option | Trade-off |
| --- | --- |
| TypeScript plus Zod | One language, runtime validation, shared types |
| JavaScript plus JSDoc | Lower build complexity, weaker guarantees and tooling |
| TypeScript plus another validator | Viable, but splits examples and ecosystem |
| Types only, no runtime validation | Unsafe at every boundary; types vanish at runtime |

## Consequences

- `strict` is on. `next typegen` runs before `tsc` so route types exist.
- Zod 4 is pinned. Validation schemas live beside the module that owns them.
- Validation includes size limits, and the database mirrors them with CHECK
  constraints because scripts and migrations bypass Zod (amendment A8).
- Every surface that renders a user string has a named encoding: React text,
  Next metadata attributes, XML escaping for feeds, JSON-LD escaping
  (amendment A8).
- Some duplication with database-inferred types is expected; the Zod schema
  remains authoritative for inputs.
- Validation failures return one predictable error shape in later work.
