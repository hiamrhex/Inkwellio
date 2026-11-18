# ADR-005: Better Auth

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

Email/password authentication, sessions, verification, and password reset are
needed. Credential storage is security-sensitive and not the product
differentiator; authorization and screens are ours.

## Decision

Use Better Auth for credentials and sessions. Keep authorization policy,
ownership checks, and UI in the `identity` module. Only that module may import
Better Auth.

## Options considered

| Option | Trade-off |
| --- | --- |
| Better Auth | Owns credential/session mechanics, database-backed rate limiting, TypeScript API |
| Auth.js | Mature ecosystem, but more assembly for our flows |
| Clerk | Fastest hosted option, but adds a paid dependency and vendor lock-in |
| Custom auth | Maximum control, unacceptable security and maintenance cost for one developer |

## Consequences

- Session and credential handling are library-owned; authorization stays
  application-owned and deny-by-default.
- Server-side `auth.api` calls are not covered by Better Auth's database rate
  limiter; our own limiter must cover them.
- The client IP header must be pinned to `x-vercel-forwarded-for` in WP2, and
  the brute-force test must rotate the header (amendment A3).
- `proxy.ts` performs optimistic redirects only; every action re-checks
  authorization.
- Better Auth tables are generated and owned by the library; do not edit them.
