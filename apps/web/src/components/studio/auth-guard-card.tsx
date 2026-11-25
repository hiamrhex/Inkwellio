import Link from "next/link";
import { Chip } from "@inkwellio/ui";

export interface AuthGuardCardProps {
  readonly heading?: string;
}

/**
 * Fail-closed unauthenticated card rendered on `/dashboard` and `/studio/[postId]`
 * when no valid session cookie is present. Exposes zero private data.
 */
export function AuthGuardCard({
  heading = "Writer Studio",
}: AuthGuardCardProps) {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-4 py-16 sm:px-6"
      style={{
        backgroundColor: "var(--bg-canvas)",
        color: "var(--text-primary)",
      }}
    >
      <section
        aria-labelledby="auth-required-title"
        className="w-full max-w-md rounded-xl border p-6 sm:p-8"
        style={{
          backgroundColor: "var(--bg-surface1)",
          borderColor: "var(--border-hairline)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="mb-4">
          <Chip>{heading}</Chip>
        </div>
        <h1
          id="auth-required-title"
          className="font-serif text-2xl font-semibold tracking-tight"
        >
          Sign in required
        </h1>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          You must sign in to open your publication dashboard, edit drafts, or manage published stories.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/sign-in"
            prefetch={false}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{
              backgroundColor: "var(--btn-primary-bg)",
              color: "var(--btn-primary-text)",
            }}
          >
            Sign in
          </Link>
          <Link
            href="/"
            prefetch={false}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              borderColor: "var(--border-hairline)",
              color: "var(--text-primary)",
            }}
          >
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}
