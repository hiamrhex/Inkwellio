# ADR-014: Export and erasure in v1

- **Status:** Proposed
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

The product promise is ownership: a writer's work is theirs, and it survives
bad edits. The matching promise is an exit — take the work out, or remove the
account — and v1 has neither. Public signup also brings NDPA 2023 duties, and
account deletion is the one event that must override the append-only revisions
in ADR-007.

Two constraints shape the mechanism. Hobby cron runs at most once a day
(±59 min), so any grace period leaves data present after the user is told it is
gone. And deletion cannot reach into Neon's 6-hour PITR window or an existing
logical dump; those copies can only age out.

## Decision

Ship export, erasure, a data inventory, and terms in v1 (amendment A6).

- Export is one authenticated `GET /api/account/export` returning JSON with the
  account, publication, every post, every revision in order, the current
  `draft_state`, slug history, and topics. Rate limited to one per hour; 25 MB
  cap.
- Erasure requires password re-entry and a single-use emailed token (15-minute
  TTL), then hard-deletes the user and every cascading row in one transaction.
  The deletion screen offers the export first.
- No soft delete and no grace period: deletion means deletion, and no scheduler
  sits between the confirmation and the effect.
- `/privacy` lists categories, purpose, location, and retention. `/terms` covers
  ownership, licence, acceptable use, takedown, termination, and 18+.
- Erasure is the only path that deletes revisions; while an account exists they
  remain immutable.

## Options considered

| Option | Trade-off |
| --- | --- |
| Defer export and deletion to v1.1 | Cheapest now, but breaks the ownership promise and leaves an NDPA duty unmet at public signup |
| Soft delete with a 7-day purge job | Recoverable, but promises "deleted" while rows remain, and depends on a once-daily cron |
| Hard delete on a confirmed request | Irreversible by design, testable end to end, no scheduler dependency (chosen) |

## Consequences

- The WP1 schema must cascade from the user, and the erasure test scans a named
  table list for the user id, email, publication slug, and a body hash. A new
  table without a line in that list fails review.
- Erasure purges cache tags, but a CDN copy can survive up to the page's
  `cacheLife` maximum (1 h). PITR and dumps can hold the rows for up to 7 days.
  `/privacy` states both.
- Deletion is not undoable. The UI makes that explicit and offers the export
  first; support is the owner's address on `/privacy`.
- Account ids in audit rows are removed with the account; the action record
  survives without the actor.
- A lawyer reviews `/privacy` and `/terms` before public signup, not before
  WP1.
