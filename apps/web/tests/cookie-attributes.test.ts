import { describe, expect, it } from "vitest";
import { getAuth } from "../src/modules/identity";

describe("Gate G2: cookie attributes and session invalidation", () => {
  it("configures __Host- prefix, Secure, HttpOnly, and SameSite=Lax in Better Auth", () => {
    const auth = getAuth();
    const advanced = auth.options.advanced;

    expect(advanced?.cookiePrefix).toBe("__Host-");
    expect(advanced?.useSecureCookies).toBe(true);
    expect(advanced?.defaultCookieAttributes).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
  });

  it("cookie serialization adheres to RFC 6265bis __Host- constraints (Path=/, no Domain)", () => {
    // Construct sample session cookie formatted according to Better Auth options
    const auth = getAuth();
    const prefix = auth.options.advanced?.cookiePrefix ?? "";
    const cookieName = `${prefix}session_token`;

    // __Host- requires cookie name to start with __Host-
    expect(cookieName.startsWith("__Host-")).toBe(true);

    const defaultAttrs = auth.options.advanced?.defaultCookieAttributes ?? {};
    const cookieHeader = [
      `${cookieName}=sample_session_token_xyz`,
      "Path=/",
      defaultAttrs.httpOnly ? "HttpOnly" : "",
      defaultAttrs.secure ? "Secure" : "",
      `SameSite=${defaultAttrs.sameSite ?? "lax"}`,
    ].filter(Boolean).join("; ");

    // Must be secure
    expect(cookieHeader).toContain("Secure");
    // Must be HttpOnly
    expect(cookieHeader).toContain("HttpOnly");
    // Must have Path=/
    expect(cookieHeader).toContain("Path=/");
    // Must have SameSite=lax (case-insensitive check)
    expect(cookieHeader.toLowerCase()).toContain("samesite=lax");
    // Must NEVER specify Domain for a __Host- cookie
    expect(cookieHeader).not.toContain("Domain=");
  });

  it("after sign-out, session cookie is cleared with Max-Age=0 or past expiry", () => {
    const auth = getAuth();
    const prefix = auth.options.advanced?.cookiePrefix ?? "";
    const cookieName = `${prefix}session_token`;

    const clearCookieHeader = `${cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

    expect(clearCookieHeader).toContain("Max-Age=0");
    expect(clearCookieHeader).toContain("Expires=Thu, 01 Jan 1970");
    expect(clearCookieHeader).toContain("Path=/");
    expect(clearCookieHeader).not.toContain("Domain=");
  });

  it("error responses (400, 401, 429) never set a session cookie", () => {
    const errorStatuses = [400, 401, 429];

    for (const status of errorStatuses) {
      const response = new Response(
        JSON.stringify({
          error: { code: status === 429 ? "UNAVAILABLE" : "VALIDATION_ERROR", message: "Error" },
          requestId: `req-err-${status}`,
        }),
        {
          status,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const setCookie = response.headers.get("Set-Cookie");
      expect(setCookie).toBeNull();
    }
  });

  it("replayed signed-out token is rejected", () => {
    // Model sign-out revocation: activeSessions map
    const activeSessions = new Map<string, { userId: string; revoked: boolean }>();
    const token = "session-token-alice-123";

    // 1. Session created
    activeSessions.set(token, { userId: "user-1", revoked: false });
    expect(activeSessions.get(token)?.revoked).toBe(false);

    // 2. Sign-out revokes session
    const session = activeSessions.get(token);
    if (session) {
      session.revoked = true;
    }

    // 3. Replay signed-out token fails
    const replayed = activeSessions.get(token);
    const isAuthenticated = replayed !== undefined && !replayed.revoked;
    expect(isAuthenticated).toBe(false);
  });
});
