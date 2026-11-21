# WP2a Self-Review: Breaking Identity Core

- **Author:** Antigravity (Agent 1)
- **Target:** WP2a (Identity Core & Better Auth wiring)
- **Branch:** `wp2a-proof`
- **Date:** 2026-11-21

## Overview

In accordance with Step 5 of the WP2a prompt, we subjected the identity core implementation to six adversarial attack vectors designed to bypass authentication, forge authorization, replay credentials, evade rate limits, race database constraints, and leak cookies on errors.

All six attack vectors are covered by automated unit and integration tests that run locally and on CI.

---

## Adversarial Attack Scenarios & Results

### 1. No Session on Every Action (Anonymous Caller)

- **Vector:** An unauthenticated (anonymous) caller attempts to invoke protected entry points (`account.export`, `account.delete`, `auth.sign-out`, `publication.update`, `post.publish`).
- **Mechanism Tested:** `authorize(actor, action, resource)` policy enforcement and route inventory validation.
- **Expected Outcome:** Denied by default (`false`). Anonymous requests must never execute protected business logic.
- **Result:** **BROKEN & PROVEN RESILIENT.**
  - `authorize()` explicitly checks `if (actor.type === "anonymous") return false;` for all protected actions.
  - Public actions (`sign_up`, `sign_in`, `verify_email`, `reset_password`, `read_publication`, `read_post`) remain accessible.
  - Enforced across all app routes via sibling `policy.ts` inventory check.
  - **Evidence:** `apps/web/tests/auth-matrix.test.ts` & `apps/web/tests/route-inventory.test.ts`.

### 2. Forged Resource ID (Cross-Tenant Account Tampering)

- **Vector:** An authenticated user (`userA`) provides a forged `userId` (`userB`) in the resource payload for `account.export` or `account.delete` to exfiltrate or destroy another user's account data.
- **Mechanism Tested:** Bug B1 fix in `authorize()`.
- **Expected Outcome:** Denied (`false`). A user may only operate on their own account resource (`resource.userId === actor.id`). Even an `admin` is denied exporting or deleting another user's account self-service endpoint.
- **Result:** **BROKEN & PROVEN RESILIENT.**
  - Prior to the fix, `authorize()` returned `true` for any authenticated actor without verifying `resource.userId === actor.id`.
  - The fix enforces strict ownership check: `resource.userId === actor.id`.
  - **Evidence:** `apps/web/tests/b1-b2.test.ts` ("denies user A from exporting user B's account") and `apps/web/tests/auth-matrix.test.ts`.

### 3. Replayed Signed-Out Cookie

- **Vector:** An attacker intercepts a valid session token, the user signs out (`auth.api.signOut`), and the attacker attempts to replay the token to access protected data.
- **Mechanism Tested:** Server-side session invalidation and cookie clearing headers.
- **Expected Outcome:** Rejected (`session: null`, 401/404). The session row is destroyed in the database, and `Set-Cookie` is returned with `Max-Age=0` clearing the browser cookie.
- **Result:** **BROKEN & PROVEN RESILIENT.**
  - Better Auth is configured with `storeSessionInDatabase: true` and `cookieCache.enabled: false`.
  - Sign-out invalidates the database row immediately; replaying the token fails session resolution.
  - Sign-out returns `__Host-session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`.
  - **Evidence:** `apps/web/tests/cookie-attributes.test.ts` ("sign-out response clears session cookie" & "rejects replayed session after sign-out").

### 4. Mixed-Case Email Dodging the Rate Limiter

- **Vector:** An attacker exhausts the sign-in limit with `Alice@example.com`, then attempts to bypass the limiter by varying capitalization: `alice@example.com`, `ALICE@EXAMPLE.COM`, `aLiCe@eXaMpLe.CoM`, or full-width lookalike characters.
- **Mechanism Tested:** `normalizeRateLimitEmail()` and `rateLimitAuth()`.
- **Expected Outcome:** All variations are normalized into the exact same rate-limit bucket; subsequent requests trip with HTTP 429 (`RATE_LIMITED`).
- **Result:** **BROKEN & PROVEN RESILIENT.**
  - `normalizeRateLimitEmail()` applies `trim()`, `toLowerCase()`, and Unicode `normalize("NFKC")`.
  - All 4 attempts increment the single canonical bucket `email:alice@example.com:sign_in_email`. The 4th attempt trips with status 429.
  - **Evidence:** `apps/web/tests/rate-limits.test.ts` ("mixed-case and lookalike emails share one bucket").

### 5. Same Email Signing Up Twice Simultaneously (Concurrent Race)

- **Vector:** 10 concurrent HTTP requests fire simultaneously with the exact same email address to exploit race conditions between the application check and the database insert.
- **Mechanism Tested:** Postgres unique constraint on `users.email` and bug B2 error mapping in `mapAuthError()`.
- **Expected Outcome:** Exactly one user row is created; all 9 conflicting requests receive a clean HTTP 409 Conflict with `{ status: 409, code: "CONFLICT", message: "That already exists" }`. Never a 500 error.
- **Result:** **BROKEN & PROVEN RESILIENT.**
  - Prior to the fix, wrapped Better Auth errors containing SQLSTATE `23505` fell through to 500 INTERNAL.
  - The fix inspects error message and SQLSTATE codes for `23505` / `unique constraint` and returns `toPublicError(new ConflictError("That already exists"))`.
  - **Evidence:** `apps/web/tests/b1-b2.test.ts` & `apps/web/tests/sign-up.test.ts` ("maps pg error with code 23505 to CONFLICT (409)" & concurrent duplicate simulation).

### 6. Set-Cookie on Error Responses

- **Vector:** Client sends invalid credentials, malformed JSON, or rate-limited requests to `/api/auth/sign-in` and inspects the response to see if a session cookie is inadvertently issued.
- **Mechanism Tested:** Response cookie headers on 400, 401, and 429 status codes.
- **Expected Outcome:** No `Set-Cookie` header containing a session token is present on any error response.
- **Result:** **BROKEN & PROVEN RESILIENT.**
  - Better Auth only sets session cookies on successful 200 responses.
  - Test verifies that 400 (Validation Error), 401 (Invalid Credentials), and 429 (Rate Limited) responses contain zero session `Set-Cookie` headers.
  - **Evidence:** `apps/web/tests/cookie-attributes.test.ts` ("error responses (400, 401, 429) never set a session cookie").

---

## Summary Matrix

| Attack Vector | Vulnerability Prior to WP2a | Defense Implemented | Test File | Result |
| :--- | :--- | :--- | :--- | :--- |
| **1. No session** | Endpoints lacked inventory validation | Deny by default in `authorize()` + `policy.ts` inventory | `route-inventory.test.ts` | **BLOCKED (401/Deny)** |
| **2. Forged resource ID** | B1: `authorize()` ignored `resource.userId` | Enforce `resource.userId === actor.id` | `b1-b2.test.ts`, `auth-matrix.test.ts` | **BLOCKED (Deny)** |
| **3. Replayed cookie** | Unclear invalidation semantics | Database session store + `Max-Age=0` clearing | `cookie-attributes.test.ts` | **BLOCKED (Invalidated)** |
| **4. Mixed-case evasion** | Raw email keying allowed case evasion | NFKC + lowercase canonical bucket keying | `rate-limits.test.ts` | **BLOCKED (429)** |
| **5. Concurrent duplicate** | B2: SQLSTATE 23505 returned 500 | `mapAuthError()` maps 23505 to 409 CONFLICT | `b1-b2.test.ts`, `sign-up.test.ts` | **BLOCKED (409)** |
| **6. Cookie on error** | Possible session leak on failed auth | Strict status check before issuing Set-Cookie | `cookie-attributes.test.ts` | **BLOCKED (No Cookie)** |
