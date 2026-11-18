# ADR-011: Path URLs at /@name

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** Richard Ilori

## Context

Every publication needs a clean, shareable address. The one-developer, free-tier
constraint rules out per-writer DNS and TLS work.

## Decision

Serve publications at `/{site}/@name` and posts beneath them. Do not offer
custom domains or subdomains in v1.

## Options considered

| Option | Trade-off |
| --- | --- |
| Path at `/@name` | No DNS, one certificate, works immediately on Hobby |
| Subdomain per writer | Stronger ownership feel, wildcard DNS and TLS overhead |
| Custom domains | Best ownership signal, heavy operations and paid-plan features |

## Consequences

- Slugs are unique per publication; publication names are unique platform-wide.
- Reserved names must be blocked (for example `api`, `admin`, `search`).
- Renames require `slug_history` so old links redirect instead of breaking.
- Names need URL-safe encoding rules and a case policy.
- Moving to subdomains later is possible but would need redirects from every
  existing path.
