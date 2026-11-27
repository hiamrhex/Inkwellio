"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  focusFirstInvalidField,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  parseAuthError,
} from "@/components/auth/auth-form-utils";
import { PasswordField } from "@/components/auth/password-field";

interface ResetPasswordFormProps {
  readonly token?: string;
  readonly urlError?: string;
}

export function ResetPasswordForm({
  token = "",
  urlError = "",
}: ResetPasswordFormProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(Boolean(urlError) || !token);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || tokenInvalid) return;

    const invalidIds: string[] = [];

    if (
      newPassword.length < MIN_PASSWORD_LENGTH ||
      newPassword.length > MAX_PASSWORD_LENGTH
    ) {
      setPasswordError(
        `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
      );
      invalidIds.push("reset-new-password");
    } else {
      setPasswordError(null);
    }

    if (confirmPassword !== newPassword) {
      setConfirmError("Passwords must match.");
      invalidIds.push("reset-confirm-password");
    } else {
      setConfirmError(null);
    }

    setFormError(null);

    if (invalidIds.length > 0) {
      focusFirstInvalidField(invalidIds);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword,
        }),
      });

      if (!response.ok) {
        const err = await parseAuthError(
          response,
          "We could not update your password right now. Please request a new reset link.",
          "reset-password",
        );
        setFormError(err.message);
        if (err.code === "INVALID_TOKEN" || err.code === "TOKEN_EXPIRED") {
          setTokenInvalid(true);
        }
        return;
      }

      setCompleted(true);
    } catch {
      setFormError("Unable to reach the reset service. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (completed) {
    return (
      <div className="auth-form" role="status">
        <div className="auth-banner auth-banner-success">
          <span className="status-dot status-dot-live" aria-hidden="true" />
          <span>Password updated</span>
        </div>
        <p className="auth-copy">
          All existing sessions have been signed out. Use your new password to sign in cleanly.
        </p>
        <Link href="/sign-in?reset=1" className="btn-primary auth-submit">
          <span className="mag-label">Sign in</span>
        </Link>
      </div>
    );
  }

  if (tokenInvalid) {
    return (
      <div className="auth-form">
        <div className="auth-banner auth-banner-error" role="alert">
          <span>
            {formError ||
              "This password reset link is invalid, expired, or missing a token."}
          </span>
        </div>
        <Link href="/forgot-password" className="btn-primary auth-submit">
          <span className="mag-label">Request a new reset link</span>
        </Link>
        <div className="auth-footer-links">
          <Link href="/sign-in" className="auth-text-link">
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
        <label htmlFor="reset-new-password" className="auth-label">
          New password
        </label>
        <PasswordField
          id="reset-new-password"
          name="newPassword"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
          value={newPassword}
          onChange={setNewPassword}
          aria-invalid={passwordError ? "true" : undefined}
          aria-describedby={
            passwordError ? "reset-password-hint reset-new-password-error" : "reset-password-hint"
          }
          placeholder="At least 8 characters"
        />
        <p id="reset-password-hint" className="auth-hint">
          Use between 8 and 128 characters.
        </p>
        {passwordError ? (
          <p id="reset-new-password-error" className="auth-error">
            {passwordError}
          </p>
        ) : null}
      </div>

      <div className="auth-field">
        <label htmlFor="reset-confirm-password" className="auth-label">
          Confirm new password
        </label>
        <PasswordField
          id="reset-confirm-password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
          value={confirmPassword}
          onChange={setConfirmPassword}
          aria-invalid={confirmError ? "true" : undefined}
          aria-describedby={confirmError ? "reset-confirm-password-error" : undefined}
          placeholder="Re-enter your new password"
        />
        {confirmError ? (
          <p id="reset-confirm-password-error" className="auth-error">
            {confirmError}
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={submitting} className="btn-primary auth-submit">
        <span className="mag-label">{submitting ? "Updating password..." : "Update password"}</span>
      </button>
    </form>
  );
}
