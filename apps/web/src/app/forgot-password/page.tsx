import type { Metadata } from "next";
import { Chip } from "@inkwellio/ui";
import { SiteShell } from "@/components/site-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password — Inkwellio",
  description: "Request a 15-minute password reset link for your Inkwellio account.",
};

export default function ForgotPasswordPage() {
  return (
    <SiteShell>
      <main id="main-content" className="auth-main">
        <section className="auth-card spotlight-card" aria-labelledby="forgot-password-heading">
          <div className="auth-card-head">
            <Chip>Account recovery</Chip>
            <h1 id="forgot-password-heading" className="auth-title">
              Reset your password
            </h1>
            <p className="auth-subtitle">
              Enter the email linked to your account. If an account exists, we will send a single-use reset link valid for 15 minutes.
            </p>
          </div>

          <ForgotPasswordForm />
        </section>
      </main>
    </SiteShell>
  );
}
