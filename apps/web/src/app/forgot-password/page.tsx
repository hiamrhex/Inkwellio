import type { Metadata } from "next";
import { Chip } from "@inkwellio/ui";
import { SiteShell } from "@/components/site-shell";
import { AuthSpatialBackdrop } from "@/components/auth/auth-spatial-backdrop";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password — Inkwellio",
  description: "Request a 15-minute password reset link for your Inkwellio account.",
};

export default function ForgotPasswordPage() {
  return (
    <SiteShell minimalHeader>
      <main id="main-content" className="auth-main">
        <div className="auth-fluted-backdrop" aria-hidden="true">
          <AuthSpatialBackdrop />
        </div>
        <section
          className="auth-card auth-monolith-card spotlight-card bento-specular-card"
          data-spotlight="true"
          aria-labelledby="forgot-password-heading"
        >
          <div className="auth-card-head">
            <Chip>Account recovery</Chip>
            <h1 id="forgot-password-heading" className="auth-title">
              Reset your password
            </h1>
            <p className="auth-subtitle">
              Enter your email address. We will send a 15-minute reset link if it matches.
            </p>
          </div>

          <ForgotPasswordForm />
        </section>
      </main>
    </SiteShell>
  );
}
