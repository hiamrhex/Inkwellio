# Inkwellio T2 Service Level Objectives (Appendix C)

Service Level Indicators (SLIs), concrete targets, and free-tier measurement strategy per `docs/STANDARDS.md` (row 33/42) and `docs/design-amendments.md` A11.

**Verification distinction:** Code-level timeouts, fail-closed status codes, and security headers are verified in CI/Vitest (`apps/web/tests/health.test.ts`, `apps/web/tests/public-read-timeout.test.ts`, `apps/web/tests/failure-drills.test.ts`, `apps/web/tests/server-headers.test.ts`). External uptime probe history, production `Server-Timing` instrumentation, and pre-writer synthetic load baselines remain **`Unverified`**.

---

## 1. SLI / SLO Table

| Flow | SLI | SLO Target (pre-1.0 free tier) | Timeout / Guardrail Implemented | Current Proof Status |
| :--- | :--- | :--- | :--- | :--- |
| Health check (`GET /api/health`) | HTTP `200` on healthy DB, `503` within timeout budget on failure | `99.5%` monthly availability (excluding upstream Neon/Vercel free-tier pauses); response `< 5,000 ms` | `SELECT 1` with `5,000 ms` ceiling (`checkDatabaseHealth`), `cache-control: no-store` | **Code verified** (`health.test.ts`, `failure-drills.test.ts`); **Live probe history: `Unverified`** |
| Public reads (`/`, `/p/[slug]`, `/topics`, `/api/topics`) | Successful HTTP `200` render / response; latency p95 | p95 `< 800 ms` (cached); clean `503` `< 15,000 ms` on DB hang | `READ_TIMEOUT_MS = 15_000` (`modules/site/timeout.ts`); `cache-control: public, max-age=60, stale-while-revalidate=300` on `/api/topics`; app error boundaries never leak messages/stacks | **Code verified** (`public-read-timeout.test.ts`, `failure-drills.test.ts`); **Prod `Server-Timing` & load baseline: `Unverified`** |
| Bounded search (`GET /api/search`) | Valid query HTTP `200`, invalid input `400`, DB outage `503` | p95 `< 1,200 ms`; `100%` rejection of empty/oversized queries before DB call | `parseSearchQuery` (1..100 chars), bounded `limit` (1..50), `withPublicDbTimeout`, `503 UNAVAILABLE` + `x-request-id` | **Code verified** (`failure-drills.test.ts`, `wp5-topics.test.ts`); **Live latency telemetry: `Unverified`** |
| Auth & OTP (`/api/auth/*`) | Rate-limit enforcement & fail-closed token verification | Zero unthrottled OTP bursts; fail closed on invalid/expired state | Per-IP and per-email limits returning `429`; generic auth errors | **Code verified** (WP2 rate-limit/auth tests); **Live Gmail 500/day ceiling drill: `Unverified`** |
| Publishing (`/api/posts/*`) | Atomic draft/publish persistence & audit durability | `99.9%` write consistency (`audit_events` written in transaction) | Postgres transactions + error mapping (`toPublicError`) | **CI Postgres 17 verified** (WP3a lifecycle tests); **Multi-writer prod baseline: `Unverified`** |

---

## 2. Free-Tier Measurement Plan (No Paid APM Vendor)

1. **External availability probe (`Unverified`):** Configure a free-tier uptime monitor (e.g., GitHub Actions cron or free external poller) hitting `GET /api/health` at a bounded interval outside peak test bursts, recording HTTP status and latency without logging secrets.
2. **Runtime request correlation (`code partially implemented; end-to-end live trace Unverified`):** Responses on dynamic routes emit `x-request-id` so operators can match browser `error.digest` / `requestId` values inside Vercel's 1-hour runtime log window (`docs/design-amendments.md` A10).
3. **`Server-Timing` & synthetic baseline (`Unverified`):** Before opening invites to the first five external writers, record a single lightweight baseline (cached public post, `/api/topics`, `/api/search`) alongside Postgres row-count growth and Neon CU-hour consumption (`docs/STANDARDS.md` row 33/42).
