# ADR-007: Append-only revisions with two pointers

- **Status:** History accepted; pointers proposed
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

Writers must never lose text, published content must stay stable while a draft
changes, and history should be inspectable. Autosave must not create unbounded
revision rows.

## Decision

Keep `post_revisions` append-only. A post holds `draft_revision_id` and
`published_revision_id`; only the pointers move. Autosave writes a separate,
mutable `draft_state` row (one per post) carrying `base_revision_id`. An
explicit save or publish appends a revision.

## Options considered

| Option | Trade-off |
| --- | --- |
| Mutable post body with optional history | Simple, but history is lossy and autosave touches live content |
| Append-only revisions plus two pointers | Strong history, stable published content, more pointer management |
| Full event sourcing | Very strong audit trail, disproportionate complexity for v1 |

## Consequences

- Autosave volume is proportional to edits, not keystrokes, and never mutates
  published content (amendment A2).
- `base_revision_id` enables concurrent-edit detection in WP3.
- Publish and save each need one transaction so pointers and revisions stay
  consistent.
- Revisions are never updated or deleted; post deletion is soft. Storage grows
  with editorial events, so archival policy is a later decision.
- The pointer design itself remains proposed until WP3 proves the transaction
  and constraint behaviour.
