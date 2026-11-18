# ADR-008: Markdown body

- **Status:** Proposed
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

Bodies must be portable, exportable, diffable, and cheap to store. Writers are
not yet proven to accept Markdown; this is an explicit product assumption.

## Decision

Store post bodies as Markdown text. Render with a CommonMark-compatible
pipeline that escapes raw HTML by default.

## Options considered

| Option | Trade-off |
| --- | --- |
| Markdown | Portable, readable in the database, easy export, simple editor |
| Rich text (JSON document) | Better toolbar UX, heavier schema and renderer, lock-in |
| Stored HTML | Fast render, unsafe and hard to sanitize or migrate |

## Consequences

- No raw HTML by default. `rehype-raw` is forbidden; if it is ever enabled,
  sanitization must follow it.
- A CSP and an image-host allowlist are required in WP4.
- The writing UI needs a toolbar and preview to test the low-confidence
  assumption; that work is deferred to WP6.
- Rendering and its XSS suite are WP4, not WP0.
