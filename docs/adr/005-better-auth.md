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
  application-owned and deny-by-default (`authorize()` in `src/modules/identity/authorize.ts`).
- Server-side `auth.api` calls are not covered by Better Auth's database rate
  limiter; our own limiter (`src/modules/identity/limiter.ts`) covers them using
  `rate_limit_counters` table with atomic upserts and exponential backoff.
- The client IP header is pinned to `x-vercel-forwarded-for` per amendment A3,
  tested to ensure rotating `x-forwarded-for` does not bypass the limiter.
- `proxy.ts` performs optimistic redirects only; every action re-checks
  authorization.
- Better Auth tables are configured via Drizzle adapter mapping to plural `users`
  and singular `session`, `account`, `verification`.
- Transactional audit logging (`src/modules/identity/audit.ts`) records failures
  aggregated per 10-minute window per `(action, ip_hash)` with SHA-256 IP/email hashing,
  metadata capped at 1032 bytes, and fail-closed transaction semantics.
- Health probe (`/api/health`) provides an isolated 5-second `SELECT 1` database check
  returning minimal `{ status: "ok" }` (200) or `{ status: "unavailable" }` (503) per amendment A11.
