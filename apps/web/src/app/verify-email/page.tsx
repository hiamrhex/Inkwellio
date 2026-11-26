import { Suspense } from "react";
import type { Metadata } from "next";
import { Chip } from "@inkwellio/ui";
import { SiteShell } from "@/components/site-shell";
import { AuthSpatialBackdrop } from "@/components/auth/auth-spatial-backdrop";
import { VerifyEmailClient } from "./verify-email-client";

export const metadata: Metadata = {
  title: "Verify email — Inkwellio",
  description: "Verify your email address or request a fresh verification link.",
};

interface VerifyEmailPageProps {
  readonly searchParams: Promise<{
    token?: string;
    error?: string;
    verified?: string;
  }>;
}

async function VerifyEmailContent({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;
  return (
    <VerifyEmailClient
      token={typeof params.token === "string" ? params.token : ""}
      urlError={typeof params.error === "string" ? params.error : ""}
      verified={params.verified === "1"}
    />
  );
}

export default function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  return (
    <SiteShell minimalHeader>
      <main id="main-content" className="auth-main">
        <div className="auth-fluted-backdrop" aria-hidden="true">
          <AuthSpatialBackdrop />
        </div>
        <section
          className="auth-card auth-monolith-card spotlight-card bento-specular-card"
          data-spotlight="true"
          aria-labelledby="verify-email-heading"
        >
          <div className="auth-card-head">
            <Chip>Email verification</Chip>
            <h1 id="verify-email-heading" className="auth-title">
              Verify your email address
            </h1>
            <p className="auth-subtitle">
              Verify your email before opening the studio or publishing posts.
            </p>
          </div>

          <Suspense
            fallback={
              <p className="auth-copy" aria-live="polite">
                Checking verification status...
              </p>
            }
          >
            <VerifyEmailContent searchParams={searchParams} />
          </Suspense>
        </section>
      </main>
    </SiteShell>
  );
}
