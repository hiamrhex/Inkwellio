# ADR-012: Curated topics with an admin role

- **Status:** Proposed
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

Topics are distribution channels. Free-form tags invite spam and duplicates;
the product launches with football and must stay topic-agnostic.

## Decision

Maintain a curated `topics` table and a `post_topics` join table. Only admins
create or rename topics. Writers assign their posts to existing topics.

## Options considered

| Option | Trade-off |
| --- | --- |
| Curated topics plus admin role | Clean taxonomy, small moderation burden |
| Free-form tags | Zero curation cost, spam and synonym sprawl |
| Algorithmic topics | No curation, opaque and premature at this scale |

## Consequences

- `users.role` gains an `admin` value; authorization must treat it as
  privileged.
- A join table with a composite primary key replaces a tag array.
- Topic pages and topic assignment are WP5 work; WP0 only reserves the module.
- Seed topics are content, not schema, so the engine stays reusable for
  psychology or literature later.
