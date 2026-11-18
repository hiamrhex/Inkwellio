# ADR-010: Three-layer rate limiting

- **Status:** Proposed
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

Login, signup, OTP email, and writes are abuse targets. Vercel Hobby provides
one WAF rate-limit rule. Better Auth's database limiter covers its own HTTP
paths, but not server-side `auth.api` calls. Gmail SMTP allows roughly 500
recipients per day (amendment A4).

## Decision

Layer limits so each covers a different gap:

1. Vercel WAF: one coarse rule at the edge.
2. Application limiter: database-backed counters around Server Actions and
   server-side auth calls.
3. Identity-specific limits: per email address and per IP for OTP,
   verification, and password reset.

## Options considered

| Option | Trade-off |
| --- | --- |
| Only the WAF rule | Cheap, but coarse and easy to evade with rotating identities |
| Only a database limiter | Survives without extra vendors, but consumes database work and compute |
| Third layer in Upstash Redis | Fast and distributed, adds another free-tier dependency |
| Three layers as above | Covers edge, application, and identity abuse | 

## Consequences

- The limiter table (or Better Auth's `rateLimit` table) grows and needs a
  cleanup job.
- Client IP must come from a pinned header; the brute-force test rotates it
  to prove it cannot move the limiter (amendment A3).
- Email sending needs per-email and per-IP limits below the Gmail ceiling, and
  one transport interface so it can be replaced.
- No rate limiting is implemented in WP0. Values and storage are settled in
  WP2 and tested with a brute-force test.
