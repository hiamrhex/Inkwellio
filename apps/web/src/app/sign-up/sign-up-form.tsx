"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  focusFirstInvalidField,
  isValidEmailFormat,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  parseAuthError,
} from "@/components/auth/auth-form-utils";

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const invalidIds: string[] = [];

    if (!trimmedName) {
      setNameError("Enter your name or publication byline.");
      invalidIds.push("sign-up-name");
    } else {
      setNameError(null);
    }

    if (!isValidEmailFormat(trimmedEmail)) {
      setEmailError("Enter a valid email address.");
      invalidIds.push("sign-up-email");
    } else {
      setEmailError(null);
    }

    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      setPasswordError(
        `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
      );
      invalidIds.push("sign-up-password");
    } else {
      setPasswordError(null);
    }

    setFormError(null);

    if (invalidIds.length > 0) {
      focusFirstInvalidField(invalidIds);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password,
          callbackURL: "/verify-email?verified=1",
        }),
      });

      if (!response.ok) {
        const err = await parseAuthError(
          response,
          "We could not start your account right now. Please check your details and try again.",
          "sign-up",
        );
        setFormError(err.message);
        focusFirstInvalidField(["sign-up-name", "sign-up-email", "sign-up-password"]);
        return;
      }

      setSubmitted(true);
    } catch {
      setFormError("Unable to reach the sign-up service. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="auth-form" role="status">
        <div className="auth-banner auth-banner-success">
          <span className="status-dot status-dot-live" aria-hidden="true" />
          <span>Check your email</span>
        </div>
        <p className="auth-copy">
          If this email is eligible for registration, we have sent a verification link. Open the link in your inbox before signing in.
        </p>
        <div className="auth-actions-stack">
          <Link href="/verify-email" className="btn-primary auth-submit">
            Need another verification link?
          </Link>
          <Link href="/sign-in" className="btn-ghost auth-submit">
            Back to sign in
          </Link>
        </div>
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
        <label htmlFor="sign-up-name" className="auth-label">
          Name
        </label>
        <input
          id="sign-up-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={nameError ? "true" : undefined}
          aria-describedby={nameError ? "sign-up-name-error" : undefined}
          className="auth-input"
          placeholder="Your name or publication name"
        />
        {nameError ? (
          <p id="sign-up-name-error" className="auth-error">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="auth-field">
        <label htmlFor="sign-up-email" className="auth-label">
          Email address
        </label>
        <input
          id="sign-up-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailError ? "true" : undefined}
          aria-describedby={emailError ? "sign-up-email-error" : undefined}
          className="auth-input"
          placeholder="you@example.com"
        />
        {emailError ? (
          <p id="sign-up-email-error" className="auth-error">
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="auth-field">
        <label htmlFor="sign-up-password" className="auth-label">
          Password
        </label>
        <input
          id="sign-up-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={passwordError ? "true" : undefined}
          aria-describedby={
            passwordError ? "sign-up-password-hint sign-up-password-error" : "sign-up-password-hint"
          }
          className="auth-input"
          placeholder="At least 8 characters"
        />
        <p id="sign-up-password-hint" className="auth-hint">
          Use between 8 and 128 characters.
        </p>
        {passwordError ? (
          <p id="sign-up-password-error" className="auth-error">
            {passwordError}
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={submitting} className="btn-primary auth-submit">
        {submitting ? "Creating account..." : "Create account"}
      </button>

      <div className="auth-field">
        <p className="auth-legal-note">
          By creating an account, you agree to the Inkwellio terms and privacy policy:
        </p>
        <div className="auth-legal-links">
          <Link href="/terms" className="auth-inline-link">
            Terms of Service
          </Link>
          <Link href="/privacy" className="auth-inline-link">
            Privacy Policy
          </Link>
        </div>
      </div>

      <div className="auth-footer-links">
        <span>Already have an account?</span>
        <Link href="/sign-in" className="auth-text-link">
          Sign in
        </Link>
      </div>
    </form>
  );
}
