"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  EMAIL_FAILED_MESSAGE,
  focusFirstInvalidField,
  isValidEmailFormat,
  parseAuthError,
} from "@/components/auth/auth-form-utils";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedEmail = email.trim();
    if (!isValidEmailFormat(trimmedEmail)) {
      setEmailError("Enter a valid email address.");
      setFormError(null);
      focusFirstInvalidField(["forgot-email"]);
      return;
    }

    setEmailError(null);
    setFormError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          redirectTo: "/reset-password",
        }),
      });

      if (!response.ok) {
        const err = await parseAuthError(
          response,
          EMAIL_FAILED_MESSAGE,
          "forgot-password",
        );
        setFormError(err.message);
        return;
      }

      setSent(true);
    } catch {
      setFormError("Unable to reach the password reset service. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-form" role="status">
        <div className="auth-banner auth-banner-success">
          <span className="status-dot status-dot-live" aria-hidden="true" />
          <span>Check your email</span>
        </div>
        <p className="auth-copy">
          If an account exists for that email address, we have sent a password reset link. Links expire after 15 minutes.
        </p>
        <Link href="/sign-in" className="btn-ghost auth-submit">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="auth-form">
      {formError ? (
        <div className="auth-banner auth-banner-error" role="alert">
          <span>{formError}</span>
        </div>
      ) : null}

      <div className="auth-field">
        <label htmlFor="forgot-email" className="auth-label">
          Email address
        </label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailError ? "true" : undefined}
          aria-describedby={emailError ? "forgot-email-error" : undefined}
          className="auth-input"
          placeholder="you@example.com"
        />
        {emailError ? (
          <p id="forgot-email-error" className="auth-error">
            {emailError}
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={submitting} className="btn-primary auth-submit">
        {submitting ? "Sending link..." : "Send reset link"}
      </button>

      <div className="auth-footer-links">
        <Link href="/sign-in" className="auth-text-link">
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
