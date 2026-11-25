# Inkwellio T2 Operational Runbooks (Appendix E)

Concise one-screen recovery procedures for a solo operator running on Vercel + Neon + Gmail SMTP free-tier infrastructure. Live production/preview drills marked `Unverified` have not been executed against live infrastructure unless noted otherwise.

---

## 1. Database unreachable or `/api/health` returns `503`

**Trigger:** `GET /api/health` returns `503 {"status":"unavailable"}`, or `/api/topics` / `/api/search` return `503 {"error":{"code":"UNAVAILABLE","status":503,"requestId":"..."}}`.

**Immediate action:**
1. Capture the `x-request-id` response header from the failing request and check Vercel runtime logs for the matching entry.
2. Check Neon Console project status, active compute state, and storage/compute limits.
3. Verify `DATABASE_URL` (and `DATABASE_URL_UNPOOLED` for migrations/seeds) are set correctly in Vercel Project Settings.
4. Confirm bad input is not waking the DB unnecessarily (`/api/search` validates `q`, `limit`, and cursor before DB access).

**Verification:** `GET /api/health` returns `200 {"status":"ok"}` and `GET /api/topics` returns `200`.

---

## 2. Neon Compute-Unit (CU-hour) quota ceiling

**Trigger:** Neon reports compute exhaustion or suspends pooled connections (`503 UNAVAILABLE` across dynamic routes). **Live CU-exhaustion simulation status: `Unverified`.**

**Immediate action:**
1. Inspect Neon usage metrics to distinguish organic reader spikes, bot scraping, or runaway queries.
2. Tighten WAF/rate-limiting rules in front of dynamic endpoints (`/api/search`, `/api/auth/*`) if traffic is abusive.
3. Rely on `modules/site` response caching for public publication feeds and post pages so repeated reader views avoid DB compute.
4. Increase Neon plan quota or wait for monthly quota reset; once restored, verify schema/seed idempotency with:
   `pnpm --filter @inkwellio/web exec tsx scripts/seed-topics.ts`

---

## 3. Leaked secret rotation

**Trigger:** Suspected exposure of `BETTER_AUTH_SECRET`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, or `GMAIL_APP_PASSWORD` in commits, screenshots, logs, or third-party tooling. **Live end-to-end rotation drill status: `Unverified`.**

**Immediate action (rotate at provider BEFORE redeploying):**
1. **Postgres (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`):** Rotate database role credentials in Neon Console, update both Vercel environment variables, and redeploy.
2. **Session signing (`BETTER_AUTH_SECRET`):** Generate a new 32+ character random secret (`openssl rand -base64 32`), update Vercel env, and redeploy immediately (invalidates existing user sessions).
3. **Email (`GMAIL_APP_PASSWORD`, `GMAIL_USER`):** Revoke the compromised Google App Password, create a replacement App Password, update Vercel env, and redeploy.
4. **Post-rotation check:** Scrub git history if committed, verify `pnpm check` passes, and review `audit_events` rows in Postgres during the exposure window.

---

## 4. Bad Vercel deploy rollback

**Trigger:** Post-deploy regression in routing, rendering (`global-error.tsx` / `error.tsx`), or headers (`server-headers.test.ts`).

**Immediate action:**
1. In Vercel Dashboard -> **Deployments**, promote the previous healthy production deployment to Production immediately.
2. Confirm `/api/health` returns `200 {"status":"ok"}` and primary pages render with theme tokens intact.
3. Revert the offending commit on `main` only after confirming no irreversible schema migration ran (`docs/PLAN.md` marks WP1 migrations as the one-way door; never roll back code behind an incompatible schema column drop without checking forward compatibility).

---

## 5. Gmail SMTP delivery failure or `500/day` limit

**Trigger:** OTP / transactional sign-in emails fail to deliver, or Google SMTP rejects messages due to the `500/day` ceiling (`docs/STANDARDS.md` row 22). **Live SMTP outage drill status: `Unverified`.**

**Immediate action:**
1. Inspect `x-request-id` logs around `/api/auth/*` to confirm whether failure is auth rejection vs. quota throttle.
2. Confirm per-IP and per-email OTP rate limits (`429`) are intact so a single actor cannot exhaust daily quota.
3. Rotate/verify `GMAIL_USER` and `GMAIL_APP_PASSWORD` if Google invalidated credentials.
4. If sustained signup volume approaches `500/day`, temporarily gate new invites or migrate SMTP transport behind the email adapter before lifting signup limits.
