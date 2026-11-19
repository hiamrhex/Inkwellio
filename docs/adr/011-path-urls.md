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

## Routing proof, 19 November 2026

A spike branch (`spike-at-route`, deleted, never merged) proved the routing. `@folder` is
parallel-route slot syntax and adds no URL segment, so the question was whether `@` is a literal
in a rewrite source. It is.

- Next's reserved-character list for source patterns is `( ) { } [ ] | \ ^ . : * + - ? $` and does not
  include `@`; patterns are otherwise `path-to-regexp` (E-033).
- Two rewrites served the public shape:

  ```ts
  { source: "/@:handle", destination: "/p/:handle" },
  { source: "/@:handle/:slug", destination: "/p/:handle/:slug" },
  ```

  `/@alice` → 200 with `handle:alice`, `/@alice/hello-world` → 200 with both params,
  `/@alice/hello/world` → 404, `/@` → 404, `/@alice?x=1` → 200. Measured with `next build` and
  `next start -p 3100` (E-033).
- The rewrite is an alias, not a redirect: `/p/alice` also returned 200. The internal route stays
  addressable, so canonical URLs and a redirect from `/p/*` to `/@*` are a WP3 decision, not an
  accident to discover later.
- `cacheComponents` constrains the page, not the rewrite. Awaiting `params` outside `<Suspense>`
  fails the build with "uncached or runtime data during prerendering"; with a boundary both routes
  build as Partial Prerender (◐). `export const instant = false` is the documented blocking
  alternative (E-034).

Conclusion: the path-URL decision stands, and it does not require middleware, a second app, or a
catch-all route.

## Consequences

- Slugs are unique per publication; publication names are unique platform-wide.
- Reserved names must be blocked (for example `api`, `admin`, `search`).
- Renames require `slug_history` so old links redirect instead of breaking.
- Names need URL-safe encoding rules and a case policy.
- Moving to subdomains later is possible but would need redirects from every
  existing path.
