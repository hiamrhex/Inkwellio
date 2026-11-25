# FAILURE MODES

T2, single region, free tier, one developer. Appendix A of the skill, applied honestly.
Every row here is a design claim until a drill proves it; the "proved" column is empty on purpose.

## 1. Failure-mode table

| Component | What can fail | Detected by | Policy | User-visible behaviour | Proved |
| --- | --- | --- | --- | --- | --- |
| Neon compute | Quota exhausted mid-month (100 CU-hrs) | Neon console + external uptime check | **Fail closed**, no fallback possible | Public pages serve stale cache for cached routes; anything uncached 503s. Honest error page. | no |
| Neon connection | Cold start 300–500 ms after 5 min idle | p95 latency | Retry once with timeout, then error | Slower first paint, not an error | no |
| Neon storage | 1 GB reached | Dashboard alert at 80 % | Fail closed on writes | "Cannot save" with a real message; reads continue | no |
| Neon region | Regional outage | Uptime probe | None (single region) | Down. Accepted risk, written down. | no |
| Vercel functions | Invocation quota / 300 s max duration | Platform usage | Fail closed | 5xx from platform, not from us | no |
| Vercel WAF | Only 1 rate-limit rule on Hobby | — | Progressive | Abuse reaches the app; app-level limiter must hold | no |
| Gmail SMTP | 500/day cap, app-password revocation, spam filtering | Send failure logs | Fail closed on verification | Signup stalls; **no publish until verified** ⇒ user cannot write | no |
| Session store (DB) | Same as Neon | Auth errors | **Fail closed** — deny | "Cannot sign in", never a half-session | no |
| Markdown render | Malformed markdown | Render error boundary | Degrade | Post shows a plain-text fallback with title; never a stack trace | no |
| Search | tsquery error or timeout | Query log | Degrade | Search returns "temporarily unavailable", rest of the site unaffected | no |
| Remote images in posts | Third party slow or tracking readers | — | Degrade | `img-src` allowlist + `referrerpolicy=no-referrer`; blocked images show alt text | no |

## 2. Fail-open / fail-closed matrix

| Control | On failure | Why |
| --- | --- | --- |
| Authorization check | **Closed** (deny) | Wrong "allow" is unrecoverable; drafts are private |
| Session validation | **Closed** | Same |
| Rate limiter | **Closed** for auth and OTP; **open** for public reads | Login abuse is worse than a slow reader; a broken limiter must not take the site down |
| Public page cache | **Stale** (serve last known good) | This is the only thing standing between us and R1 |
| Search | **Open** (feature unavailable) | Non-critical |
| Email send | **Closed** for verification-gated actions | Never claim "check your inbox" when nothing was sent |

## 3. SPOF register

| SPOF | Mitigation | Cost of an outage | Recovery independent of the failure? |
| --- | --- | --- | --- |
| Neon (DB + auth tables) | None possible on free tier; weekly logical dump | Total (no writes, no login) | No — escalate to paid or restore elsewhere |
| Vercel (hosting + functions) | Keep the app portable: no platform-only APIs; env via standard variables | Total | Partly — a Node server can run the same app |
| GitHub (repo) | Local clone + `git bundle` monthly | Lose history | Yes |
| npm registry | Lockfile committed | Cannot rebuild | Partly — cache, no guarantee |
| Gmail account | App password; abstract the transport behind one interface | No verification mail | Yes — swap provider behind the interface |
| Domain + DNS | Registrar expiry monitoring | Email auth breaks; site URL breaks | Yes |
| One developer | Runbooks in `docs/` written for a stranger | Project stalls | No |
| Single secret set | Rotation procedure written, not drilled | Long recovery if leaked | Yes |

## 4. Blast radius

| Event | Worst case | Limiting control | Detect | Reverse |
| --- | --- | --- | --- | --- |
| Bad deploy | Entire site broken | Vercel instant rollback; preview first | Smoke check after deploy | < 2 min |
| Bad migration | Data loss on `posts` | Expand/contract; run twice on a branch first | Constraint tests + row counts | Restore from PITR (≤ 6 h) |
| Leaked `DATABASE_URL` | Total read/write of all content | Rotate credential; Neon role scoped to app schema | Alert on unusual egress | Minutes (rotate) |
| Leaked session secret | All sessions forgeable | Rotate; force logout | Anomalous admin actions | Minutes |
| Compromised writer account | Defacement of one publication | Ownership checks; no cross-publication writes | Report | Minutes (revert to prior revision — the one place append-only history pays off) |
| Abuse wave / spam signups | Hobby project removed under ToS §4 | Invite-only signups; WAF rule; per-IP limits | Signup rate | Hours, and possibly not reversible |
| Runaway autosave | Quota + storage exhaustion | Debounced autosave, capped revisions | Size alert | Prune draft revisions |

## 5. Dependency graph and circularity check

```
Browser → Vercel → Next.js → Neon
                        ↘ Gmail SMTP
Recovery paths:
  rollback        → Vercel dashboard (independent of Neon)          ✓
  DB restore      → Neon console (independent of Vercel)            ✓
  code recovery   → local clone / git bundle (independent of both)  ✓
  login recovery  → depends on Neon AND Vercel                      ✗ accepted for v1
  status page     → none exists                                     ✗ Unverified (rely on GET /api/health + external probe)
```

The one genuine circularity: **you cannot log in to fix the database if the database is the thing that is
broken.** At T2 with 5 writers the acceptable answer is "the owner fixes it from the Neon console", not a
break-glass auth path. It must be written down, not forgotten.

## 5a. Automated Code Proofs vs. Unverified Live Drills (WP8)

The main failure-mode table above leaves `Proved` = `no` for live infrastructure events until executed against real preview/production services. Automated code-level checks prove the application fail-closed behavior under mocked/simulated faults:

- **Proved in automated tests (`health.test.ts`, `failure-drills.test.ts`, `public-read-timeout.test.ts`, `disclosure.test.ts`, `seed-topics.test.ts`):**
  - Unset `DATABASE_URL` and black-hole TCP hangs return `503` on `/api/health`, `/api/topics`, and `/api/search` within bounded timeouts (`SELECT 1` `5,000 ms`, public read timeout `15,000 ms`) with `cache-control: no-store`, `x-content-type-options: nosniff`, `x-request-id` (on API JSON errors), and zero leaked SQL/secrets/stack traces.
  - `/api/search` validates input before database access (`400 VALIDATION_ERROR` when DB is unavailable).
  - `error.tsx`, `global-error.tsx`, and `not-found.tsx` render only `error.digest`, keep dark/light token fallbacks intact, never render `error.message` or stack traces, and omit search inputs from `404`.
  - `scripts/seed-topics.ts` fails closed without printing secrets when `DATABASE_URL_UNPOOLED`/`DATABASE_URL` is absent or invalid.
- **`Unverified` live operational drills (not run against deployed Vercel/Neon/Gmail):**
  - Live Neon 100 CU-hour quota exhaustion, Neon 1 GB storage cutoff, and real PITR/branch restore drill (`runbooks`: [docs/RUNBOOKS.md](docs/RUNBOOKS.md)).
  - Live Gmail `500/day` SMTP quota saturation and live secret rotation end-to-end drill.
  - External uptime monitor polling history and pre-writer synthetic load baseline ([docs/SLO.md](docs/SLO.md)).

## 6. Overload plan

Shedding order when saturated: (1) prefetch requests, (2) search queries, (3) uncached feed pagination,
(4) new sessions — but never (5) authorization checks or (6) saves already accepted.

Bounds: request body ≤ 256 KB, page size ≤ 50, autosave ≥ 1 revision per 30 s, one in-flight save per post.
Retry budget: one retry, 250 ms base, jitter, only on connection errors and only at the DB layer. No retries
at the page level, or the DB sees 2× cold-start traffic.

## 7. Assume-breach tests (run in WP9, each with the first control disabled)

1. Authorization with the policy module stubbed to "allow" — the DB constraints must still prevent cross-owner writes.
2. Rate limiter disabled — can a single IP still exhaust the Gmail cap?
3. CSP removed — does stored XSS from markdown execute? (Expect: no, because escaping is by default; prove it.)
4. Vercel WAF rule deleted — does the app-level limiter hold `/sign-in`?
5. Backup assumed good — restore into a scratch branch and diff row counts.

## 8. What this architecture cannot remove

Single region, single provider pair, single developer, no independent pentest, 6-hour recovery window,
1 GB of change history. These are **accepted**, not solved, and the acceptance is the owner's to sign, not
the reviewer's.
