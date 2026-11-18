# Design amendments

Owner-approved changes to the design doc, 18 November 2026. Notes only, no code.
These override the corresponding sections of `Blog Platform Architecture and System Design.md`.

## A1. Neon compute, not storage, is the binding constraint

Neon free = **100 CU-hours per project per month** (≈ 400 hours at 0.25 CU). Hitting it **suspends compute**;
existing connections drop and new connections cannot open until the next billing period or an upgrade.
So the failure is a total outage, not "writes fail".

**Public page caching moves earlier, next to WP1/WP4.** It is an availability control, not a Lighthouse
optimisation, and it is the only thing keeping the project on the free tier.
Source: `neon.com/faqs/free-plan-limits-and-quotas` (E-007, E-008).

## A2. Autosave does not create revisions

Autosave writes to a **mutable `draft_state` row** (one per post). **`post_revisions` stays append-only** and
is written only on explicit save or on publish. This keeps "history is immutable" true, keeps autosave off
live content, and keeps storage proportional to editorial events rather than keystrokes.
`draft_state` also carries `base_revision_id`, which is what makes concurrent-edit detection possible.

## A3. Auth IP source must be pinned, and the test must spoof

Better Auth reads `x-forwarded-for` by default. On plain Vercel that default is **safe**, because Vercel
overwrites the header and does not forward external IPs, explicitly to prevent spoofing (E-015).
The risk returns the moment anything sits in front of Vercel.

**WP2 sets `ipAddressHeaders: ['x-vercel-forwarded-for']`** — documented as identical to `x-forwarded-for`
but not overwritten when a proxy is in front — and the brute-force test **rotates the header** to prove the
limiter does not move.

Correction of record: my earlier review said the default was spoofable on Vercel. That was wrong; the
correct statement is in this section.

## A4. Email: Gmail SMTP with an app password

Transport: Gmail SMTP via nodemailer, app password (2FA required on the account), **~500 recipients/day**.
Because the external ceiling is small and invisible to users, OTP and verification requests are rate limited
**per email address and per IP**, and the transport sits behind one interface so it can be swapped without
touching identity code.

Unverified and load-bearing: whether Vercel Functions permit outbound SMTP on 587/465 at all (U-3). Test
before building on it; if blocked, the interface is the escape hatch.

## A5. Hosting is portable, and the terms question is open

Vercel Hobby's terms say "personal or non-commercial use" and reserve the right to remove projects without
notice, including for performance problems caused by malicious attack (E-009). Whether a public multi-user
publishing service is "personal" is **not settled**, and Mr Tobi's answer is still pending.

Until it is answered: keep the deploy portable — no platform-only APIs, standard environment variables,
Node-runnable app, documented migration path off Vercel — and keep signups closed to invited writers.
