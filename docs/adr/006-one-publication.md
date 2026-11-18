# ADR-006: A publication entity, one per user

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

Writers need an owned home at `/@name`. The product starts with one identity
per writer and must not let a user accidentally create several competing
publications.

## Decision

Create a `publications` row with a `UNIQUE` foreign key to its owner. A
publication is created lazily on the first visit to the writing area with
`INSERT ... ON CONFLICT (owner_id) DO NOTHING`.

## Options considered

| Option | Trade-off |
| --- | --- |
| One publication per user, unique constraint | Simple ownership and URLs; hard limit |
| Many publications per user | More flexible, more UI and authorization surface |
| Publication as a profile only | No separate lifecycle or settings |

## Consequences

- The database, not application code, prevents a second publication.
- Lazy creation is safe under concurrent requests and survives a failed signup
  hook.
- The unique constraint is easy to drop if the product later allows more
  publications; the surrounding table structure is the expensive part to
  change, so it is decided now.
- Owners are the only writers in v1; collaboration is out of scope.
