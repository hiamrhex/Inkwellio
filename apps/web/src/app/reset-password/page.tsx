import { Suspense } from "react";
import type { Metadata } from "next";
import { Chip } from "@inkwellio/ui";
import { SiteShell } from "@/components/site-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Set new password — Inkwellio",
  description: "Choose a new password for your Inkwellio writer account.",
};

interface ResetPasswordPageProps {
  readonly searchParams: Promise<{
    token?: string;
    error?: string;
  }>;
}

async function ResetPasswordContent({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  return (
    <ResetPasswordForm
      token={typeof params.token === "string" ? params.token : ""}
      urlError={typeof params.error === "string" ? params.error : ""}
    />
  );
}

export default function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  return (
    <SiteShell minimalHeader>
      <main id="main-content" className="auth-main">
        <div className="auth-fluted-backdrop" aria-hidden="true" />
        <section
          className="auth-card auth-monolith-card spotlight-card bento-specular-card"
          data-spotlight="true"
          aria-labelledby="reset-password-heading"
        >
          <div className="auth-card-head">
            <Chip>Account recovery</Chip>
            <h1 id="reset-password-heading" className="auth-title">
              Choose a new password
            </h1>
            <p className="auth-subtitle">
              Pick a password between 8 and 128 characters. Updating it signs out other sessions.
            </p>
          </div>

          <Suspense
            fallback={
              <p className="auth-copy" aria-live="polite">
                Validating reset link...
              </p>
            }
          >
            <ResetPasswordContent searchParams={searchParams} />
          </Suspense>
        </section>
      </main>
    </SiteShell>
  );
}
