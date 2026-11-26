"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  focusFirstInvalidField,
  isValidEmailFormat,
  parseAuthError,
} from "@/components/auth/auth-form-utils";

interface VerifyEmailClientProps {
  readonly token?: string;
  readonly urlError?: string;
  readonly verified?: boolean;
}

export function VerifyEmailClient({
  token = "",
  urlError = "",
  verified = false,
}: VerifyEmailClientProps) {
  const [status, setStatus] = useState<"idle" | "verifying" | "verified" | "invalid">(
    verified && !urlError ? "verified" : urlError ? "invalid" : token ? "verifying" : "idle",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(
    urlError
      ? "This verification link is invalid or has expired. Enter your email below to request a new link."
      : null,
  );
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token || urlError || verified) return;

    let cancelled = false;
    const verify = async () => {
      try {
        const res = await fetch(
          `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          },
        );
        if (cancelled) return;
        if (res.ok) {
          setStatus("verified");
          setStatusMessage(null);
        } else {
          const parsed = await parseAuthError(
            res,
            "This verification link is invalid or has expired.",
            "verify-email",
          );
          setStatus("invalid");
          setStatusMessage(parsed.message);
        }
      } catch {
        if (!cancelled) {
          setStatus("invalid");
          setStatusMessage("Unable to verify your email right now. Please try again.");
        }
      }
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [token, urlError, verified]);

  const handleResend = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedEmail = email.trim();
    if (!isValidEmailFormat(trimmedEmail)) {
      setEmailError("Enter a valid email address.");
      setResendError(null);
      focusFirstInvalidField(["verify-email-address"]);
      return;
    }

    setEmailError(null);
    setResendError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          callbackURL: "/verify-email?verified=1",
        }),
      });

      if (!response.ok) {
        const err = await parseAuthError(
          response,
          "We could not send a verification link right now.",
          "verify-email",
        );
        setResendError(err.message);
        return;
      }

      setResendSent(true);
    } catch {
      setResendError("Unable to reach the verification service. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "verifying") {
    return (
      <div className="auth-form" role="status">
        <div className="auth-banner">
          <span className="status-dot status-dot-amber" aria-hidden="true" />
          <span>Checking your verification link...</span>
        </div>
      </div>
    );
  }

  if (status === "verified") {
    return (
      <div className="auth-form" role="status">
        <div className="auth-banner auth-banner-success">
          <span className="status-dot status-dot-live" aria-hidden="true" />
          <span>Your email address is verified.</span>
        </div>
        <p className="auth-copy">
          Your Inkwellio writer account is ready. Sign in to set up your publication and write your first draft.
        </p>
        <Link href="/sign-in?verified=1" className="btn-primary auth-submit">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-form">
      {statusMessage ? (
        <div className="auth-banner auth-banner-error" role="alert">
          <span>{statusMessage}</span>
        </div>
      ) : null}

      {resendSent ? (
        <div className="auth-banner auth-banner-success" role="status">
          <span className="status-dot status-dot-live" aria-hidden="true" />
          <span>If that account needs verification, a fresh link has been sent to your inbox.</span>
        </div>
      ) : null}

      {resendError ? (
        <div className="auth-banner auth-banner-error" role="alert">
          <span>{resendError}</span>
        </div>
      ) : null}

      <form onSubmit={handleResend} noValidate className="auth-form">
        <div className="auth-field">
          <label htmlFor="verify-email-address" className="auth-label">
            Email address
          </label>
          <input
            id="verify-email-address"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={emailError ? "true" : undefined}
            aria-describedby={emailError ? "verify-email-error" : undefined}
            className="auth-input"
            placeholder="you@example.com"
          />
          {emailError ? (
            <p id="verify-email-error" className="auth-error">
              {emailError}
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={submitting} className="btn-primary auth-submit">
          {submitting ? "Sending link..." : "Send verification link"}
        </button>
      </form>

      <div className="auth-footer-links">
        <Link href="/sign-in" className="auth-text-link">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
