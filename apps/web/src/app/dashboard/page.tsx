import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { DashboardClient } from "@/components/studio/dashboard-client";
import {
  loadDashboardData,
  resolveStudioActor,
} from "@/components/studio/server-data";

export const metadata: Metadata = {
  title: "Writer Dashboard · Inkwellio",
};

async function DashboardLoader() {
  const actor = await resolveStudioActor(await headers());
  if (actor === null) {
    redirect("/sign-in?next=%2Fdashboard");
  }

  const loaded = await loadDashboardData(actor);
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
          Dashboard temporarily unavailable
        </h1>
        <p className="max-w-md text-sm" style={{ color: "var(--text-muted)" }}>
          We could not reach your publication workspace right now. Please try again shortly.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center rounded-md border px-4 py-2 text-sm font-medium"
          style={{
            borderColor: "var(--border-hairline)",
            color: "var(--text-primary)",
          }}
        >
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <DashboardClient
      publication={loaded.publication}
      initialPosts={loaded.posts}
    />
  );
}

export default function DashboardPage() {
  return (
    <WorkspaceShell activePath="/dashboard">
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
            <div className="mx-auto max-w-4xl text-sm">Loading dashboard...</div>
          </main>
        }
      >
        <DashboardLoader />
      </Suspense>
    </WorkspaceShell>
  );
}
