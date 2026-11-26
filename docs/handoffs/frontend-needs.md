# Frontend Handoff: Auth Sign-Up, Verification & Limiter Findings (W1.4)

Recorded during WP7 Phase 1B local verification on `http://localhost:3014` (`next start`, `NODE_ENV=production`) backed by local Postgres `55433`, using a throwaway address (`qa+<timestamp>@example.test`) cleaned up in the same session.

## Observed Reproduction Evidence

| Request | Condition | HTTP Status | Sanitized Body | Frontend Impact |
| --- | --- | --- | --- | --- |
| `POST /api/auth/sign-up/email` | First call (`NODE_ENV=production`, `GMAIL_*` unset) | `200` | `{"token":null,"user":{"name":"QA Test","email":"<test-email>","emailVerified":false,...}}` | Unverified user row is created, email send throws in background, UI falsely believes an email went out |
| `POST /api/auth/send-verification-email` | Resend link (`NODE_ENV=production`, `GMAIL_*` unset) | `500` | Empty body (`content-type: null`) | Better Auth awaits `sendVerificationEmail`; `ProductionEmailTransport` throws and surfaces a 500 with no JSON body |
| `POST /api/auth/sign-up/email` | Call 4 & 5 (after 1 sign-up + 1 verify + 2 retries within 60s) | `429` | `{"message":"Too many requests. Please try again later."}` | Better Auth's built-in limiter blocks caller on attempt #4 with `{message}` (no `code` field) |
| `POST /api/auth/sign-up/email` | Call 6+ within 600s window | `429` | `{"code":"RATE_LIMITED","message":"Too many requests"}` | App-layer limiter (`rateLimitAuth`, `max: 5 / 600s`) blocks caller for 10 min |
| `POST /api/auth/sign-in/email` | Wrong password | `401` | `{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}` | Mapped to non-enumerating credential message |
| `POST /api/auth/sign-in/email` | Unverified account | `403` | `{"message":"Email not verified","code":"EMAIL_NOT_VERIFIED"}` | Mapped to verify-email prompt |
| `POST /api/auth/sign-up/email` | Bad input | `400` | `{"message":"[body.email] Invalid email address","code":"VALIDATION_ERROR"}` | Mapped to field/detail check message |
| `POST /api/auth/sign-up/email` | Request `Origin` != `BETTER_AUTH_URL` | `403` | `{"message":"Invalid origin","code":"INVALID_ORIGIN"}` | Mapped to address mismatch reload guidance |

## Root Causes (Read-Only Analysis)

1. **Silent verification-email failure on sign-up (`modules/identity/index.ts` + `modules/identity/email.ts`)**
   - Running Next.js in production build mode (`next start`) sets `NODE_ENV=production`.
   - In `email.ts:176-178`, `getEmailTransport()` selects `ProductionEmailTransport` strictly on `env.NODE_ENV === "production"`, and `getTransporter()` (`email.ts:118-120`) throws if `GMAIL_USER` or `GMAIL_APP_PASSWORD` are unset.
   - During `POST /api/auth/sign-up/email`, Better Auth schedules `sendVerificationEmail` through `advanced.backgroundTasks.handler` (`index.ts:193-199`), which catches and logs `background_task_failed` silently. The HTTP response returns `200`, leaving an unverified user with no verification link delivered.
   - Calling `POST /api/auth/send-verification-email` runs `sendVerificationEmail` synchronously inside the request lifecycle, returning HTTP `500` with an empty body.

2. **`no-trusted-ip` shared bucket & stacked limiters (`modules/identity/index.ts` + `modules/identity/limiter.ts`)**
   - `handleAuthPost` (`index.ts:281-304`) runs `rateLimitAuth(..., { max: 5, windowSeconds: 600 })` BEFORE delegating to Better Auth, while Better Auth runs its own `rate_limits` table (`index.ts:163-175`, default 3/min on `/sign-up/email`).
   - Because `advanced.ipAddress.ipAddressHeaders` is pinned to `["x-vercel-forwarded-for"]` (`index.ts:179`), local previews or non-Vercel origins without that header collapse every caller into Better Auth's single `no-trusted-ip|/sign-up/email` bucket, and `getClientIp()` falls back to `127.0.0.1` / local client IP for all callers.
   - When retries happen after a failed email delivery or LAN origin mismatch, attempts #1–#5 burn the 10-minute `rateLimitAuth` quota and trigger HTTP `429` for subsequent sign-ups.

3. **LAN origin mismatch (`index.ts:68`)**
   - `trustedOrigins` contains only `[baseURL]` (`BETTER_AUTH_URL`). Opening a local preview server via LAN IP (`http://192.168.x.x:3002`) when `BETTER_AUTH_URL=http://localhost:3002` fails CSRF origin validation with HTTP `403` `INVALID_ORIGIN`.

## Recommendations for Backend / Environment Owner (Out of Wave A Frontend Scope)

1. Fail fast or expose an explicit dev/preview capturing mode toggle (e.g., dedicated env flag rather than assuming `next start` always has production SMTP secrets), OR return a clean `503` `{ code: "EMAIL_NOT_SENT" }` instead of swallowing sign-up verification email exceptions silently in `backgroundTasks`.
2. Ensure local preview hosts match `BETTER_AUTH_URL` (`localhost:<port>`) and consider whether `rateLimitAuth` should exempt failed pre-email SMTP errors or align window limits with Better Auth's internal limiter.
3. Update `verify-email` / auth client handling (completed in Wave A Phase 1B): handle empty `500` bodies gracefully as `"We could not send the email. Try again shortly."` and distinguish `403 INVALID_ORIGIN` from `403 EMAIL_NOT_VERIFIED`.
