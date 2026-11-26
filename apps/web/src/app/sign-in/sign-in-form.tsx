"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  focusFirstInvalidField,
  isValidEmailFormat,
  parseAuthError,
} from "@/components/auth/auth-form-utils";
import { PasswordField } from "@/components/auth/password-field";

interface SignInFormProps {
  readonly redirectTo: string;
  readonly showVerifiedBanner?: boolean;
  readonly showResetBanner?: boolean;
}

export function SignInForm({
  redirectTo,
  showVerifiedBanner = false,
  showResetBanner = false,
}: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedEmail = email.trim();
    const invalidIds: string[] = [];

    if (!isValidEmailFormat(trimmedEmail)) {
      setEmailError("Enter a valid email address.");
      invalidIds.push("sign-in-email");
    } else {
      setEmailError(null);
    }

    if (!password) {
      setPasswordError("Enter your password.");
      invalidIds.push("sign-in-password");
    } else {
      setPasswordError(null);
    }

    setFormError(null);
    setNeedsVerification(false);

    if (invalidIds.length > 0) {
      focusFirstInvalidField(invalidIds);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
        }),
      });

      if (!response.ok) {
        const err = await parseAuthError(
          response,
          "We could not sign you in right now. Please try again.",
          "sign-in",
        );
        setFormError(err.message);
        if (err.code === "EMAIL_NOT_VERIFIED") {
          setNeedsVerification(true);
        }
        focusFirstInvalidField(["sign-in-email", "sign-in-password"]);
        return;
      }

      window.location.assign(redirectTo);
    } catch {
      setFormError("Unable to reach the sign-in service. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="auth-form">
      {showVerifiedBanner ? (
        <div className="auth-banner auth-banner-success" role="status">
          <span className="status-dot status-dot-live" aria-hidden="true" />
          <span>Your email address is verified. Sign in below to continue.</span>
        </div>
      ) : null}

      {showResetBanner ? (
        <div className="auth-banner auth-banner-success" role="status">
          <span className="status-dot status-dot-live" aria-hidden="true" />
          <span>Your password has been updated. Sign in with your new password.</span>
        </div>
      ) : null}

      {formError ? (
        <div id="sign-in-summary-error" className="auth-banner auth-banner-error" role="alert">
          <span>{formError}</span>
          {needsVerification ? (
            <Link href="/verify-email" className="auth-inline-link">
              Resend verification link
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="auth-field">
        <label htmlFor="sign-in-email" className="auth-label">
          Email address
        </label>
        <input
          id="sign-in-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailError ? "true" : undefined}
          aria-describedby={emailError ? "sign-in-email-error" : undefined}
          className="auth-input"
          placeholder="you@example.com"
        />
        {emailError ? (
          <p id="sign-in-email-error" className="auth-error">
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="auth-field">
        <div className="auth-label-row">
          <label htmlFor="sign-in-password" className="auth-label">
            Password
          </label>
          <Link href="/forgot-password" className="auth-text-link">
            Forgot password?
          </Link>
        </div>
        <PasswordField
          id="sign-in-password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={setPassword}
          aria-invalid={passwordError ? "true" : undefined}
          aria-describedby={passwordError ? "sign-in-password-error" : undefined}
          placeholder="••••••••"
        />
        {passwordError ? (
          <p id="sign-in-password-error" className="auth-error">
            {passwordError}
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={submitting} className="btn-primary auth-submit">
        {submitting ? "Signing in..." : "Sign in"}
      </button>

      <div className="auth-footer-links">
        <span>New to Inkwellio?</span>
        <Link href="/sign-up" className="auth-text-link">
          Create an account
        </Link>
      </div>
    </form>
  );
}
