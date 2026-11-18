# ADR-003: Neon with the WebSocket driver for writes

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

The app runs as Vercel Functions, where short-lived processes and many
connections make direct TCP pooling awkward. Drizzle's HTTP driver for Neon
does not support interactive transactions, and the write flows need one
transaction per save or publish.

## Decision

Host PostgreSQL on Neon and use `@neondatabase/serverless` over WebSocket for
transactional writes. Public reads may use the HTTP driver later where a
transaction is not required.

## Options considered

| Option | Trade-off |
| --- | --- |
| Neon HTTP driver for everything | Simplest, but no interactive transactions |
| Neon WebSocket driver for writes | Transactions work; slightly more connection setup |
| Direct TCP with a pooler | More moving parts on serverless; no need at this scale |
| Another managed Postgres | More cost or less generous free tier |

## Consequences

- Save, publish, and publication creation can be atomic.
- One region only; latency and availability follow Neon.
- Free-plan compute is 100 CU-hours per project per month. Exhausting it
  suspends compute and causes a total outage until the next period or an
  upgrade. Caching public pages moves earlier (amendment A1).
- Vendor coupling is contained in the future `kernel/db` adapter.
