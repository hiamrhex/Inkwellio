import type { Metadata } from "next";
import { Chip } from "@inkwellio/ui";
import { SiteShell } from "@/components/site-shell";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Create account — Inkwellio",
  description: "Start your independent football publication on Inkwellio.",
};

export default function SignUpPage() {
  return (
    <SiteShell>
      <main id="main-content" className="auth-main">
        <section className="auth-card spotlight-card" aria-labelledby="sign-up-heading">
          <div className="auth-card-head">
            <Chip>Independent publishing</Chip>
            <h1 id="sign-up-heading" className="auth-title">
              Create your writer account
            </h1>
            <p className="auth-subtitle">
              Claim your handle, draft in Markdown, and publish long-form football writing under your own link.
            </p>
          </div>

          <SignUpForm />
        </section>
      </main>
    </SiteShell>
  );
}
