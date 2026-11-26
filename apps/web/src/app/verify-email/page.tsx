import { Suspense } from "react";
import type { Metadata } from "next";
import { Chip } from "@inkwellio/ui";
import { SiteShell } from "@/components/site-shell";
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
    <SiteShell>
      <main id="main-content" className="auth-main">
        <section className="auth-card spotlight-card" aria-labelledby="verify-email-heading">
          <div className="auth-card-head">
            <Chip>Email verification</Chip>
            <h1 id="verify-email-heading" className="auth-title">
              Verify your email address
            </h1>
            <p className="auth-subtitle">
              We verify writer addresses before opening studio access or publishing.
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
