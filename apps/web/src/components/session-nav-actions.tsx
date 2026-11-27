"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AuthSessionState = "guest" | "signed-in";

interface SessionPayload {
  user?: { id?: string } | null;
  session?: { id?: string } | null;
}

/**
 * Tiny idle-deferred navigation auth slot.
 * Calls GET /api/auth/get-session after load + idle and swaps Sign in / Sign up
 * to Dashboard / Sign out inside a fixed-width container (zero CLS).
 */
export function SessionNavActions() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthSessionState>("guest");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/get-session", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
        if (!ct.includes("application/json")) return;
        const data = (await res.json()) as SessionPayload | null;
        if (!cancelled && data && data.user?.id && data.session?.id) {
          setAuthState("signed-in");
        }
      } catch {
        // Stay gracefully in guest state if network or auth is offline.
      }
    };

    const scheduleCheck = () => {
      if (cancelled) return;
      const ric = (
        window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
      ).requestIdleCallback;
      if (typeof ric === "function") {
        idleId = ric(() => {
          if (!cancelled) void checkSession();
        }, { timeout: 1800 });
      } else {
        timerId = setTimeout(() => {
          if (!cancelled) void checkSession();
        }, 250);
      }
    };

    if (document.readyState === "complete") {
      scheduleCheck();
    } else {
      window.addEventListener("load", scheduleCheck, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleCheck);
      if (
        idleId !== null &&
        typeof (window as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback === "function"
      ) {
        (window as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
      if (timerId !== null) clearTimeout(timerId);
    };
  }, []);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } catch {
      // Ignore network error; reset local UI state.
    } finally {
      setAuthState("guest");
      setSigningOut(false);
      router.refresh();
    }
  };

  return (
    <div className="nav-auth-slot">
      {authState === "signed-in" ? (
        <>
          <Link href="/dashboard" className="nav-auth-link">
            Dashboard
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="nav-auth-pill"
          >
            <span className="mag-label">{signingOut ? "Signing out" : "Sign out"}</span>
          </button>
        </>
      ) : (
        <>
          <Link href="/sign-in" className="nav-auth-link">
            Sign in
          </Link>
          <Link href="/sign-up" className="nav-auth-pill">
            <span className="mag-label">Sign up</span>
          </Link>
        </>
      )}
    </div>
  );
}
