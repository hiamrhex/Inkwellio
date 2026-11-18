# INTAKE

Project: **Inkwellio** — multi-user blogging platform, one publication per writer at `/@name`.
Owner: Richard Ilori. Reviewer: agent, 18 November 2026.
Mode: **AUDIT (plan-level)**. Risk tier: **T2**.

## Context

One developer, no deadline, $0 budget, free tier only. One Next.js 16 app (TypeScript) with the backend
inside it, modular monolith, Neon Postgres + Drizzle, Better Auth, Vercel Hobby. Football is the launch
topic; the engine is topic-agnostic.

## What exists today

- Repository `hiamrhex/Inkwellio`: **empty, zero commits**, remote configured, branch `main`.
- Two documents: the design doc (local, Downloads) and `docs/design-review-2026-11-18.md`.
- No code, no schema, no CI, no deployment.

Any score of the *system* is therefore 0 by definition. This audit scores **design coverage**: does the
design address the layer, with a verification method, or not.

## Users and journeys

1. **Writer**: sign up → write in markdown → autosave → publish → share link → edit later without losing history.
2. **Reader**: open a link from a chat → read a fast, calm page → find more by the same writer. No account.
3. **Owner (admin)**: curate topics, take down abuse.

What failure costs them: a writer losing a draft or a published post is the product's whole promise
("ownership, history, clean pages"). A reader hitting a 4-second page or a dead link loses trust silently.

## Data classification

Personal data: email, display name, IP (via auth rate limiting), session identifiers.
User-generated content: markdown bodies, titles, slugs, revision history. No payments, no health data,
no children, no location beyond IP-derived.
Jurisdiction: Nigeria (NDPA), with likely EU readers → GDPR-relevant minimum: export and deletion.

## Architecture as designed

```
Browser → Vercel (WAF, 1 rate-limit rule) → Next.js app (proxy.ts, app/ routes, modules, kernel)
        → Neon Postgres (one region, WebSocket driver for transactions)
```

Modules: identity | publications | posts | topics | search | site. Kernel: db, env, errors, rate limit, logger.

## Constraints that shape every decision

| Constraint | Value | Behaviour at 100% |
| --- | --- | --- |
| Vercel Hobby | 1M invocations, 100 GB transfer, 4 CPU-hrs, 1 h logs, 100 deploys/day | wait ~30 days **(E-004)** |
| Vercel Hobby ToS | "personal or non-commercial use" only; discretionary shutdown | project removed, no notice **(E-009)** |
| Vercel WAF | 1 rate-limit rule, IP/JA4 keys only, fixed window **(E-005)** | no per-user throttling at edge |
| Vercel Cron | once per day, ±59 min jitter **(E-006)** | no frequent jobs |
| Neon free | 100 CU-hrs/mo, 1 GB storage, 5 GB egress, 10 branches, 6 h PITR **(E-007)** | **compute suspended, connections refused (E-008)** |
| Neon PITR | 6 hours, capped at 1 GB change history **(E-007)** | older recovery impossible |
| Email (Gmail SMTP) | ~500/day, app password, per-amendment-4 | verification mails stop |
| Team | one developer; bus factor 1 | — |

## System map (trust boundaries marked)

- **TB1** Browser ↔ Vercel edge: untrusted input, cookies, CSRF surface.
- **TB2** Next.js ↔ Neon: trusted network, but the DB credential is a single secret.
- **TB3** Next.js ↔ Gmail SMTP: third party, rate-limited, deliverability not under our control.
- **TB4** Reader ↔ embedded remote images in markdown: third parties see reader IPs.

## What would hurt most

One sentence: **the database suspends on day 17 of the month because public pages were not cached, and
every writer's publication goes dark simultaneously with no warning and no way to restore service until
the next billing period.**

Second: a writer's draft silently disappears because two tabs overwrote each other, which destroys the
only promise the product makes.

## Assumptions (marked, not verified)

- [A1] Writers will tolerate markdown. **Unverified, cheapest test is one evening.**
- [A2] Gmail SMTP is deliverable enough for 200 users' verification mail. **Unverified; see U-3.**
- [A3] Vercel applies the external IP to `x-forwarded-for`; assumed true from E-016.
- [A4] Neon compute stays awake far longer than the quota allows at the design's own load estimate.
  **Recomputed, not measured — see AUDIT R1.**
