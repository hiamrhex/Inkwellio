# ADR-001: Modular monolith with vertical slices

- **Status:** Proposed
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

One developer, one Next.js app, and a feature list that will keep growing
(comments, likes, images, suggested edits). A three-package layered design was
rejected because every feature would touch several packages.

## Decision

Ship one deployable Next.js app, split into feature modules that own their
schema, validation, logic, actions, and UI. Modules expose exactly one public
entry point, `index.ts`. Tooling enforces the boundaries in CI.

## Options considered

| Option | Complexity | Cost | Fit at this scale | Cost of the next feature |
| --- | --- | --- | --- | --- |
| A: Layered packages (web, core, db) | Medium | Free | Fine | High: every feature touches every layer |
| B: Modular monolith, vertical slices | Medium | Free | Fine | Low: add or edit one folder |
| C: Separate Express API plus Next.js UI | High | Hosting for two apps | Higher than needed | Medium: contract and deploy overhead |

## Consequences

- Easier: adding or deleting a feature, testing a module alone, reading the
  codebase by domain.
- Harder: cross-module reads must go through public functions rather than a
  shared query; discipline is required to keep `index.ts` small.
- Enforcement: `dependency-cruiser` rules plus a fixture test, both in
  `pnpm check`.
- Revisit if a second client (mobile app) or an independent deploy cadence
  appears.
