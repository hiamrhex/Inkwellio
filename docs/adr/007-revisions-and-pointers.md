# ADR-007: Append-only revisions with a moving published pointer

- **Status:** History accepted; pointers proposed
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

Writers must never lose text, published content must stay stable while a draft
changes, and history should be inspectable. Autosave must not create unbounded
revision rows.

## Decision

Keep `post_revisions` append-only. A post holds `published_revision_id`; the
draft pointer lives on the mutable `draft_state` row (one per post) as
`base_revision_id`, beside a monotonic `version`. A post with no `draft_state`
row is a fresh post at `version = 0`. An explicit save or publish appends a
revision.

Consolidation of record (19 November): the design's `posts.draft_revision_id`
is dropped. `draft_state.base_revision_id` is the same fact, and two pointers to
one revision is a state pair that can disagree after a migration or a script.

Every write to a draft is compare-and-set on `version`, not on
`base_revision_id` (amendment A7).

## Post lifecycle

Four states; `status` is one column with a `CHECK`, and the reviewer's request for a state diagram is
this table.

| From | To | Trigger | Invariants |
| --- | --- | --- | --- |
| `draft` | `published` | publish, `expected_version` matches | appends a revision; sets `published_at` once; `published_revision_id` non-null |
| `published` | `published` | publish a newer revision | `published_at` unchanged; republishing the same revision is a no-op success (A9) |
| `published` | `draft` | unpublish | `published_revision_id` cleared; the public URL 404s; revisions kept |
| `draft` or `published` | `deleted` | owner deletes | soft: `deleted_at` set, rows and revisions kept, public read 404s |
| `deleted` | `draft` | restore | allowed by the data model; no restore UI in v1 |

Illegal and rejected by the transaction, not by the interface: `deleted → published` (restore first);
publish with an empty title or body; publish or unpublish by anyone but the owner; any transition
without a matching `version` (A7). `published_at` is written exactly once and never moves, so
"published 3 March" cannot become "published today" through an edit.

## Options considered

| Option | Trade-off |
| --- | --- |
| Mutable post body with optional history | Simple, but history is lossy and autosave touches live content |
| Append-only revisions plus two pointers | Strong history, stable published content, more pointer management |
| Full event sourcing | Very strong audit trail, disproportionate complexity for v1 |

## Consequences

- Autosave volume is proportional to edits, not keystrokes, and never mutates
  published content (amendment A2).
- `version` is the concurrency token: a write that does not match it returns a
  conflict instead of overwriting another tab's text (A7). `base_revision_id`
  records which revision the draft grew from; two autosaves can share a base,
  so the base alone cannot detect a second writer.
- Publish and save each need one transaction so pointers and revisions stay
  consistent.
- Revisions are never updated, and they are deleted only by account erasure
  (amendment A6). Post deletion is soft; storage grows with editorial events,
  so archival policy is a later decision.
- Deletion is soft but not reversible through the interface in v1: the rows
  survive for history and for support, and restore is a data operation.
- The pointer design remains proposed until WP3 proves the transaction and
  constraint behaviour; the lifecycle table above is what WP3's transaction
  tests assert.
