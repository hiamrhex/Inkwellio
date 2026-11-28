import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  loadSettingsData,
  resolveStudioSession,
} from "@/components/studio/server-data";
import { SettingsPrivacyClient } from "@/components/studio/settings-privacy-client";

export const metadata: Metadata = {
  title: "Account & Privacy Settings · Inkwellio",
};

async function SettingsPrivacyLoader() {
  const session = await resolveStudioSession(await headers());
  if (session === null) {
    redirect("/sign-in?next=%2Fsettings%2Fprivacy");
  }

  const loaded = await loadSettingsData(session);
  if (loaded.kind === "unavailable") {
    return (
      <main
        id="main-content"
        className="workspace-main flex flex-col items-center justify-center gap-4 px-4 py-16 text-center"
        style={{
          backgroundColor: "var(--bg-canvas)",
          color: "var(--text-primary)",
        }}
      >
        <h1 className="font-serif text-2xl font-semibold">
          Settings temporarily unavailable
        </h1>
        <p className="max-w-md text-sm" style={{ color: "var(--text-muted)" }}>
          We could not load your account and publication settings right now. Please try again shortly.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex min-h-[44px] items-center rounded-md border px-4 py-2 text-sm font-medium"
          style={{
            borderColor: "var(--border-hairline)",
            color: "var(--text-primary)",
          }}
        >
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <SettingsPrivacyClient
      session={loaded.session}
      publication={loaded.publication}
      postCounts={loaded.postCounts}
    />
  );
}

export default function SettingsPrivacyPage() {
  return (
    <WorkspaceShell activePath="/settings/privacy">
      <Suspense
        fallback={
          <main
            id="main-content"
            className="workspace-main py-12"
            style={{
              backgroundColor: "var(--bg-canvas)",
              color: "var(--text-muted)",
            }}
          >
            <div className="mx-auto max-w-3xl text-sm">Loading settings...</div>
          </main>
        }
      >
        <SettingsPrivacyLoader />
      </Suspense>
    </WorkspaceShell>
  );
}
