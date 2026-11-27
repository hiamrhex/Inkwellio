/**
 * wave-a-auth-legal.test.ts — Agent 4 (WP7 Wave A Phase A2) Auth & Legal routes test suite.
 *
 * Enforces:
 *  1. Every public auth & legal route (/sign-in, /sign-up, /verify-email, /forgot-password,
 *     /reset-password, /privacy, /terms) exports sibling policy = "public".
 *  2. All routes share <SiteShell> and <main id="main-content"> landmarks.
 *  3. Auth forms enforce accessible visible <label htmlFor>, aria-describedby, focus-on-first-error,
 *     autoComplete attributes, and >= 44px tap targets.
 *  4. Server-side safeRedirect protects /sign-in ?next= without importing @/modules/identity into client code.
 *  5. Real Better Auth endpoints (/api/auth/sign-in/email, /api/auth/sign-up/email, /api/auth/verify-email,
 *     /api/auth/send-verification-email, /api/auth/request-password-reset, /api/auth/reset-password),
 *     non-enumerating UX, and 429 rate-limit message ("Too many attempts. Try again in a few minutes.").
 *  6. Legal pages carry "Draft, pending review", "Not legal advice", curated retention figures, and zero "elite".
 *  7. Mutation proofs confirming validators catch insecure client imports and bad error mapping.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  EMAIL_FAILED_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  isValidEmailFormat,
  parseAuthError,
  RATE_LIMIT_MESSAGE,
  VALIDATION_MESSAGE,
} from "../src/components/auth/auth-form-utils";
import { getPasswordVisibilityState, PasswordField } from "../src/components/auth/password-field";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const ROUTES = [
  "sign-in",
  "sign-up",
  "verify-email",
  "forgot-password",
  "reset-password",
  "privacy",
  "terms",
] as const;

const signInPage = readSrc("apps/web/src/app/sign-in/page.tsx");
const signInForm = readSrc("apps/web/src/app/sign-in/sign-in-form.tsx");
const signUpPage = readSrc("apps/web/src/app/sign-up/page.tsx");
const signUpForm = readSrc("apps/web/src/app/sign-up/sign-up-form.tsx");
const verifyEmailPage = readSrc("apps/web/src/app/verify-email/page.tsx");
const verifyEmailClient = readSrc("apps/web/src/app/verify-email/verify-email-client.tsx");
const forgotPage = readSrc("apps/web/src/app/forgot-password/page.tsx");
const forgotForm = readSrc("apps/web/src/app/forgot-password/forgot-password-form.tsx");
const resetPage = readSrc("apps/web/src/app/reset-password/page.tsx");
const resetForm = readSrc("apps/web/src/app/reset-password/reset-password-form.tsx");
const privacyPage = readSrc("apps/web/src/app/privacy/page.tsx");
const termsPage = readSrc("apps/web/src/app/terms/page.tsx");
const authUtils = readSrc("apps/web/src/components/auth/auth-form-utils.ts");
const cssSrc = readSrc("apps/web/src/app/globals.css");

describe("Wave A Phase A2 — Auth & Legal policy, shell, and accessibility", () => {
  it("declares sibling policy = 'public' and renders SiteShell minimalHeader + fluted backdrop + monolith card", () => {
    for (const route of ROUTES) {
      const policySrc = readSrc(`apps/web/src/app/${route}/policy.ts`);
      const pageSrc = readSrc(`apps/web/src/app/${route}/page.tsx`);
      expect(policySrc).toMatch(/export const policy = ["']public["'] as const;/);
      expect(pageSrc, `${route} page must render <SiteShell>`).toContain("<SiteShell");
      expect(pageSrc, `${route} page must render id="main-content"`).toContain('id="main-content"');
      expect(pageSrc, `${route} must ban the word elite`).not.toMatch(/\belite\b/i);
    }

    for (const [label, authSrc] of [
      ["/sign-in", signInPage],
      ["/sign-up", signUpPage],
      ["/verify-email", verifyEmailPage],
      ["/forgot-password", forgotPage],
      ["/reset-password", resetPage],
    ] as const) {
      expect(authSrc, `${label} must use minimalHeader`).toContain("<SiteShell minimalHeader>");
      expect(authSrc, `${label} must mount AmbientOrbs`).toContain("<AmbientOrbs");
      expect(authSrc, `${label} must render cursor spotlight`).toContain("auth-cursor-spotlight");
      expect(authSrc, `${label} must render fluted backdrop`).toContain("auth-fluted-backdrop");
      expect(authSrc, `${label} must enable auth backdrop parallax`).toContain('data-auth-parallax="true"');
      expect(authSrc, `${label} must mount lazy AuthSpatialBackdrop`).toContain("<AuthSpatialBackdrop");
      expect(authSrc, `${label} must use monolith rim-lit card`).toContain("auth-monolith-card");
      expect(authSrc, `${label} must enable 3D auth card tilt`).toContain('data-tilt-auth="true"');
    }
    for (const [label, formSrc] of [
      ["sign-in-form", signInForm],
      ["sign-up-form", signUpForm],
      ["forgot-password-form", forgotForm],
      ["reset-password-form", resetForm],
      ["verify-email-client", verifyEmailClient],
    ] as const) {
      expect(formSrc, `${label} must wrap magnetic label inside auth-submit`).toContain('className="mag-label"');
    }
    const spatialBackdropSrc = readSrc("apps/web/src/components/auth/auth-spatial-backdrop.tsx");
    expect(spatialBackdropSrc).toContain('loading="lazy"');
    expect(spatialBackdropSrc).toContain("spatial-monolith-dark.webp");
    expect(spatialBackdropSrc).toContain("spatial-slab-light.webp");
    expect(cssSrc).toContain(".auth-cursor-spotlight");
    expect(cssSrc).toContain(".auth-fluted-backdrop");
    expect(cssSrc).toContain("auth-backdrop-float");
    expect(cssSrc).toContain("var(--abx, 0px)");
    expect(cssSrc).toContain("var(--atx, 0)");
    expect(cssSrc).toContain(".auth-spatial-img");
    expect(cssSrc).toContain(".site-header-inner-minimal");
  });

  it("wraps searchParams / headers readers in <Suspense> for Next.js Cache Components compatibility", () => {
    for (const [name, src] of [
      ["sign-in", signInPage],
      ["verify-email", verifyEmailPage],
      ["reset-password", resetPage],
    ] as const) {
      expect(src, `${name} must use <Suspense>`).toContain("<Suspense");
    }
  });

  it("computes safeRedirect server-side on /sign-in and never imports @/modules/identity in client files", () => {
    expect(signInPage).toContain("safeRedirect");
    expect(signInPage).toContain("@/modules/identity");
    const forbiddenClientImport = /\bfrom\s+["']@\/(modules\/identity|kernel\/)/;
    for (const clientSrc of [
      authUtils,
      signInForm,
      signUpForm,
      verifyEmailClient,
      forgotForm,
      resetForm,
    ]) {
      expect(clientSrc).not.toMatch(forbiddenClientImport);
      expect(clientSrc).not.toMatch(/\belite\b/i);
    }
    expect(`import { safeRedirect } from "@/modules/identity";`).toMatch(forbiddenClientImport);
  });

  it("uses real Better Auth endpoints, non-enumerating UX, visible labels, aria-describedby & 44px controls", () => {
    expect(signUpPage).toContain("<SignUpForm");
    expect(forgotPage).toContain("<ForgotPasswordForm");
    expect(signInForm).toContain("/api/auth/sign-in/email");
    expect(signInForm).toContain('autoComplete="email"');
    expect(signInForm).toContain('autoComplete="current-password"');
    expect(signInForm).toContain('href="/forgot-password"');
    expect(signInForm).toContain('href="/sign-up"');

    expect(signUpForm).toContain("/api/auth/sign-up/email");
    expect(signUpForm).toContain('autoComplete="new-password"');
    expect(signUpForm).toContain("Check your email");
    expect(signUpForm).toContain('href="/privacy"');
    expect(signUpForm).toContain('href="/terms"');

    expect(verifyEmailClient).toContain("/api/auth/verify-email");
    expect(verifyEmailClient).toContain("/api/auth/send-verification-email");

    expect(forgotForm).toContain("/api/auth/request-password-reset");
    expect(forgotForm).toContain('redirectTo: "/reset-password"');

    expect(resetForm).toContain("/api/auth/reset-password");
    expect(resetForm).toContain('href="/forgot-password"');

    for (const formSrc of [signInForm, signUpForm, verifyEmailClient, forgotForm, resetForm]) {
      expect(formSrc).toContain("htmlFor=");
      expect(formSrc).toContain("aria-describedby=");
      expect(formSrc).toContain("focusFirstInvalidField");
      expect(formSrc).toContain("parseAuthError");
    }

    expect(cssSrc).toMatch(/\.auth-input\s*\{[^}]*background:\s*#0d0f14/);
    expect(cssSrc).toContain(".auth-input:-webkit-autofill");
    expect(cssSrc).toContain("0 0 0 1000px #0d0f14 inset");
    expect(cssSrc).toContain("transition: background-color 9999s");
    expect(cssSrc).toMatch(/\[data-theme="light"\]\s*\.auth-input\s*\{[^}]*background:\s*#ffffff/);
    expect(cssSrc).toMatch(/\.auth-password-toggle\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
  });

  it("PasswordField renders Show password button (type=button), spellcheck=false, and reusable across all 3 forms", () => {
    const html = renderToStaticMarkup(
      createElement(PasswordField, {
        id: "pw-test",
        name: "password",
        autoComplete: "current-password",
        value: "",
        onChange: () => {},
      }),
    );
    expect(html).toContain('type="password"');
    expect(html).toMatch(/spellcheck="false"/i);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('type="submit"');

    const hiddenState = getPasswordVisibilityState(false);
    const shownState = getPasswordVisibilityState(true);
    expect(hiddenState).toEqual({
      inputType: "password",
      ariaLabel: "Show password",
      ariaPressed: false,
      buttonType: "button",
    });
    expect(shownState).toEqual({
      inputType: "text",
      ariaLabel: "Show password",
      ariaPressed: true,
      buttonType: "button",
    });

    const pwComponent = readSrc("apps/web/src/components/auth/password-field.tsx");
    expect(pwComponent).toContain("aria-label={state.ariaLabel}");
    expect(pwComponent).toContain("aria-pressed={state.ariaPressed}");
    expect(pwComponent).toContain("spellCheck={false}");

    expect(signInForm).toContain("<PasswordField");
    expect(signUpForm).toContain("<PasswordField");
    expect(resetForm).toContain("<PasswordField");
  });

  it("parseAuthError maps 429, wrong creds, validation, invalid origin, and 500 email failure distinctly without enumeration", async () => {
    const rateLimited = new Response("rate limited", { status: 429 });
    const parsed429 = await parseAuthError(rateLimited, "fallback", "sign-in");
    expect(parsed429.message).toBe(RATE_LIMIT_MESSAGE);
    expect(parsed429.message).toBe("Too many attempts. Try again in a few minutes.");

    const ba429 = new Response(JSON.stringify({ message: "Too many requests. Please try again later." }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
    expect((await parseAuthError(ba429, "fallback", "sign-up")).message).toBe(RATE_LIMIT_MESSAGE);

    const invalidLogin = new Response(JSON.stringify({ code: "INVALID_EMAIL_OR_PASSWORD" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
    const parsed401 = await parseAuthError(invalidLogin, "fallback", "sign-in");
    expect(parsed401.message).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(parsed401.message).toContain("could not sign you in");
    expect(parsed401.message).not.toMatch(/user\s+not\s+found|already\s+exists/i);

    const unverifiedLogin = new Response(JSON.stringify({ code: "EMAIL_NOT_VERIFIED", message: "Email not verified" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
    expect((await parseAuthError(unverifiedLogin, "fallback", "sign-in")).code).toBe("EMAIL_NOT_VERIFIED");

    const badOrigin = new Response(JSON.stringify({ code: "INVALID_ORIGIN", message: "Invalid origin" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
    expect((await parseAuthError(badOrigin, "fallback", "sign-in")).code).toBe("INVALID_ORIGIN");

    const email500 = new Response(null, { status: 500 });
    const parsedVerify500 = await parseAuthError(email500, "fallback", "verify-email");
    expect(parsedVerify500.message).toBe(EMAIL_FAILED_MESSAGE);
    expect(parsedVerify500.message).toBe("We could not send the email. Try again shortly.");

    const validation400 = new Response(JSON.stringify({ code: "VALIDATION_ERROR", message: "bad field" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    expect((await parseAuthError(validation400, "fallback", "sign-up")).message).toBe(VALIDATION_MESSAGE);

    const badEmail400 = new Response(JSON.stringify({ code: "VALIDATION_ERROR", message: "[body.email] Invalid email address" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    expect((await parseAuthError(badEmail400, "fallback", "sign-up")).message).toBe("Enter a valid email address.");

    const expiredReset = new Response(JSON.stringify({ code: "INVALID_TOKEN" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    const parsedReset = await parseAuthError(expiredReset, "fallback", "reset-password");
    expect(parsedReset.code).toBe("INVALID_TOKEN");
    expect(parsedReset.message).toMatch(/invalid or has expired/i);
  });

  it("mutation proof: isValidEmailFormat rejects malformed addresses and accepts real addresses", () => {
    expect(isValidEmailFormat("writer@inkwellio.example")).toBe(true);
    expect(isValidEmailFormat("invalid")).toBe(false);
    expect(isValidEmailFormat("a@b")).toBe(false);
    expect(isValidEmailFormat("user @example.com")).toBe(false);
  });

  it("Privacy and Terms pages clearly state draft status, non-legal-advice disclaimer & grounded facts", () => {
    for (const legalSrc of [privacyPage, termsPage]) {
      expect(legalSrc).toContain("<Chip>Draft, pending review</Chip>");
      expect(legalSrc).toContain("Not legal advice");
      expect(legalSrc).not.toMatch(/\belite\b/i);
    }
    expect(privacyPage).toContain("90 days");
    expect(privacyPage).toContain("24 hours");
    expect(privacyPage).toContain("25 MB");
    expect(privacyPage).toContain("7 days");
    expect(termsPage).toContain("18");
    expect(termsPage).toContain("non-exclusive licence");
  });
});
