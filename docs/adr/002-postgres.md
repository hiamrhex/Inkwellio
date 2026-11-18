# ADR-002: PostgreSQL

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

The data is relational: users own publications, publications own posts, posts
own revisions, and topics relate many-to-many. Several invariants must hold
under concurrency, including one publication per user and unique slugs.

## Decision

Use PostgreSQL as the only production datastore.

## Options considered

| Option | Strengths | Why not chosen |
| --- | --- | --- |
| PostgreSQL | Constraints, transactions, partial indexes, built-in full-text search | — |
| SQLite | Zero operations, simple local files | Weak fit for concurrent serverless writes and hosted multi-user access |
| MySQL | Mature relational engine | No advantage here; design and evidence target Postgres |
| MongoDB | Flexible documents | Invariants would move into application code |

## Consequences

- Constraints carry invariants that would otherwise be easy to break:
  `UNIQUE (owner_id)`, `UNIQUE (publication_id, slug)`, composite foreign keys
  for revision pointers.
- Full-text search can start in Postgres without another service.
- Adds an operational dependency and a backup/restore obligation.
- The free Neon plan's compute allowance, not storage, is the binding
  constraint; caching is an availability control (amendment A1).
