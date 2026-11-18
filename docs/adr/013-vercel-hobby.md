# ADR-013: Vercel Hobby

- **Status:** Conditional on Mr Tobi's answer
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

Vercel Hobby is free, integrates with Next.js, and fits the expected load of
roughly 120,000 requests per month. Its terms limit use to personal or
non-commercial projects, and Vercel reserves the right to remove projects
without notice, including after performance problems caused by an attack.

## Decision

Target Vercel Hobby for v1, conditional on confirmation that a public,
multi-user publishing service is acceptable. Keep the deploy portable in the
meantime.

## Options considered

| Option | Trade-off |
| --- | --- |
| Vercel Hobby | Free, zero-config Next.js, but ambiguous terms and no SLA |
| Vercel Pro | Clearer commercial terms, monthly cost |
| Another Node host | More control, more operations work for one developer |

## Consequences

- No platform-only APIs. Standard environment variables, a Node-runnable app,
  and a documented migration path.
- Hobby keeps about one hour of runtime logs, so independent error logging is
  required.
- Hobby allows one function region, so functions pin to `lhr1` and the Neon
  project is created in `aws-eu-west-2` (London) — the same AWS region, and the
  closest pair for the intended audience (A9). There is no function failover.
- Every outbound call has an inner timeout well below the platform's 300 s
  ceiling; request budget is 30 s (A9).
- Signups stay closed to invited writers until the terms question is answered
  (amendment A5).
- Revisit when the platform serves commercial interests or outgrows the plan.
