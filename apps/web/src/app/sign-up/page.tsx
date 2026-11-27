import type { Metadata } from "next";
import { Chip } from "@inkwellio/ui";
import { SiteShell } from "@/components/site-shell";
import { AmbientOrbs } from "@/components/ambient-orbs";
import { AuthSpatialBackdrop } from "@/components/auth/auth-spatial-backdrop";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Create account — Inkwellio",
  description: "Start your independent football publication on Inkwellio.",
};

export default function SignUpPage() {
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
          aria-labelledby="sign-up-heading"
        >
          <div className="auth-card-head">
            <Chip>Independent publishing</Chip>
            <h1 id="sign-up-heading" className="auth-title">
              Create your writer account
            </h1>
            <p className="auth-subtitle">
              Pick a handle, write in Markdown, and publish at your own link.
            </p>
          </div>

          <SignUpForm />
        </section>
      </main>
    </SiteShell>
  );
}
