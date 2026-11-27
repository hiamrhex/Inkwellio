import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Chip } from "@inkwellio/ui";
import { SiteShell } from "@/components/site-shell";
import { AmbientOrbs } from "@/components/ambient-orbs";
import { AuthSpatialBackdrop } from "@/components/auth/auth-spatial-backdrop";
import { safeRedirect } from "@/modules/identity";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in — Inkwellio",
  description: "Sign in to open your publication dashboard and studio drafts.",
};

interface SignInPageProps {
  readonly searchParams: Promise<{
    next?: string;
    redirect?: string;
    verified?: string;
    reset?: string;
  }>;
}

async function SignInContent({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const requestOrigin = `${proto}://${host}`;

  const rawNext =
    typeof params.next === "string"
      ? params.next
      : typeof params.redirect === "string"
        ? params.redirect
        : "";
  const redirectTo = rawNext ? safeRedirect(rawNext, requestOrigin) : "/dashboard";

  return (
    <SignInForm
      redirectTo={redirectTo}
      showVerifiedBanner={params.verified === "1"}
      showResetBanner={params.reset === "1"}
    />
  );
}

export default function SignInPage({ searchParams }: SignInPageProps) {
  return (
    <SiteShell minimalHeader>
      <main id="main-content" className="auth-main">
        <AmbientOrbs />
        <div className="auth-cursor-spotlight" aria-hidden="true" />
        <div className="auth-fluted-backdrop" data-auth-parallax="true" aria-hidden="true">
          <AuthSpatialBackdrop />
        </div>
        <section
          className="auth-card auth-monolith-card spotlight-card bento-specular-card"
          data-spotlight="true"
          data-tilt-auth="true"
          aria-labelledby="sign-in-heading"
        >
          <div className="auth-card-head">
            <Chip>Writer account</Chip>
            <h1 id="sign-in-heading" className="auth-title">
              Sign in to Inkwellio
            </h1>
            <p className="auth-subtitle">
              Open your dashboard and manage your drafts.
            </p>
          </div>

          <Suspense
            fallback={
              <p className="auth-copy" aria-live="polite">
                Loading sign-in form...
              </p>
            }
          >
            <SignInContent searchParams={searchParams} />
          </Suspense>
        </section>
      </main>
    </SiteShell>
  );
}
