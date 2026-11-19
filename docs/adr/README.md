# Decision records

Fourteen records as of 19 November 2026. Each one is only worth keeping if it can be wrong, so this
index carries the two facts that make that possible: what would overturn the decision, and when it is
revisited. A decision with no revisit date is this file's defect, not the reader's.

Rule: when a revisit date passes, the record is re-read, and one of three things happens — it is
re-affirmed with the date moved, it is superseded by a new record, or it is marked Rejected. None of
those is a failure; a stale record silently treated as current is.

## Index

| ADR | Decision | Overturned if | Revisit by |
| --- | --- | --- | --- |
| [001](001-modular-monolith.md) | Modular monolith, vertical slices | Two modules need one transaction that the seam rules forbid, or a module must deploy separately for a real constraint | 2027-02-19 |
| [002](002-postgres.md) | PostgreSQL | Content plus audit outgrows Neon's 1 GB, or a constraint we rely on cannot be expressed | 2027-02-19 |
| [003](003-neon-websocket.md) | Neon WebSocket driver for writes | Pooled connection setup plus cold start pushes a write past the 30 s budget, or the driver drops connections under the load baseline | 2027-02-19 |
| [004](004-drizzle.md) | Drizzle ORM + drizzle-kit | A required CHECK or constraint cannot be expressed in a migration, or the glob/layout proves unrunnable under the real config | 2026-11-26 |
| [005](005-better-auth.md) | Better Auth | Enumeration or timing cannot be equalised in configuration (U-2), or it does not run under Next 16 `proxy.ts` | 2026-12-10 |
| [006](006-one-publication.md) | One publication per user | A writer needs a second publication, which turns a unique constraint into a migration with live content | 2027-02-19 |
| [007](007-revisions-and-pointers.md) | Append-only revisions, one moving published pointer | `version` contention blocks two writers on one post, or revision storage grows past the schema's assumptions | 2027-01-19 |
| [008](008-markdown.md) | Markdown body, rendered server-side | RSC rendering misses the latency target, or a required extension needs raw HTML | 2027-01-19 |
| [009](009-typescript-zod.md) | TypeScript strict + Zod at every boundary | Validation cost shows up in the p95, or a boundary needs a shape Zod cannot express | 2027-01-19 |
| [010](010-rate-limiting.md) | Three-layer rate limiting | The database-backed limiter becomes the bottleneck, or the single Hobby WAF rule cannot cover the real attack | 2026-12-10 |
| [011](011-path-urls.md) | Path URLs at `/@name` | Handle squatting or a reserved-path collision makes names unusable | 2027-01-19 |
| [012](012-curated-topics.md) | Curated topics, admin-managed | Seeded topics cannot cover the content and writers need free tags | 2027-02-19 |
| [013](013-vercel-hobby.md) | Vercel Hobby, conditional | Mr Tobi answers that this is commercial use (U-6), or the single region and 300 s limit bite in production | 2026-11-26 |
| [014](014-export-and-erasure.md) | Export and erasure in v1 | A real account's export exceeds the 25 MB cap, or erasure cannot finish inside the request budget | 2027-02-19 |

## Template for a new record

```markdown
# ADR-NNN: <decision in one line>

- **Status:** Proposed | Accepted | Superseded by ADR-NNN | Rejected
- **Date:** YYYY-MM-DD
- **Deciders:** <name>
- **Revisit by:** YYYY-MM-DD

## Context
What forces a decision now; the constraint, not the preference.

## Decision
What will be done, in the present tense, specific enough to test.

## Options considered
| Option | Trade-off |
| --- | --- |

## Consequences
What becomes true, what becomes harder, and what is now someone's job.

## Overturned if
The observation that would make this decision wrong. Not "if requirements change" — a measurement,
an answer, or a failure.
```

Two rules for the falsifier: it must be observable, and it must be something that could plausibly
happen at this scale. "If the platform changes everything" is not a falsifier.
