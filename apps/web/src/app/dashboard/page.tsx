import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AuthGuardCard } from "@/components/studio/auth-guard-card";
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
    return <AuthGuardCard heading="Writer Dashboard" />;
  }

  const loaded = await loadDashboardData(actor);
  if (loaded.kind === "unavailable") {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-16 text-center"
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
          prefetch={false}
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
    <Suspense
      fallback={
        <main
          className="min-h-screen px-4 py-12 sm:px-6"
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
  );
}
