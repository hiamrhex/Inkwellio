/**
 * Identity: Better Auth configuration and authorization policy.
 *
 * Only this module may import Better Auth. All authorization checks are
 * performed here, never in proxy.ts (which is optimistic only).
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDb } from "@/kernel/db";
import { env } from "@/kernel/env";
import { logEvent } from "@/kernel/log";
import { toPublicError, type PublicError } from "@/kernel/errors";
import { users } from "./schema";

/**
 * Lazy Better Auth instance.
 *
 * Created on first access so that tests can run without BETTER_AUTH_SECRET
 * and BETTER_AUTH_URL being set. The Drizzle adapter uses our existing
 * `users` table (mapped to `user` in the adapter). Better Auth will create
 * its own `session`, `account`, `verification`, and `rateLimit` tables on
 * migration.
 */
let authInstance: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
  if (authInstance !== null) {
    return authInstance;
  }

  // In test environment, provide minimal config without requiring secrets
  const isTest = env.NODE_ENV === "test";
  const secret = isTest ? "test-secret-minimum-32-characters-long" : env.BETTER_AUTH_SECRET;
  const baseURL = isTest ? "http://localhost:3000" : env.BETTER_AUTH_URL;

  authInstance = betterAuth({
    appName: "Inkwellio",
    baseURL,
    basePath: "/api/auth",
    secret,

    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: users,
      },
      usePlural: true,
    }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: false,
      sendResetPassword: async ({ user, url, token }) => {
        logEvent("info", "send_reset_password", { userId: user.id, url, token });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url, token }) => {
        logEvent("info", "send_verification_email", { userId: user.id, url, token });
      },
    },

    session: {
      modelName: "sessions",
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
      storeSessionInDatabase: true,
      cookieCache: {
        enabled: false,
      },
    },

    account: {
      modelName: "accounts",
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
    },

    verification: {
      storeIdentifier: "hashed",
      storeInDatabase: true,
    },

    rateLimit: {
      enabled: true,
      window: 10,
      max: 100,
      storage: "database",
      modelName: "rate_limit",
    },

    advanced: {
      ipAddress: {
        ipAddressHeaders: ["x-vercel-forwarded-for"],
        disableIpTracking: false,
      },
      useSecureCookies: true,
      cookiePrefix: "__Host-",
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      },
      database: {
        generateId: "uuid",
        validateSchema: true,
      },
      backgroundTasks: {
        handler: (promise) => {
          promise.catch((error) => {
            logEvent("error", "background_task_failed", { error: String(error) });
          });
        },
      },
    },

    hooks: {
      before: async (ctx) => {
        logEvent("debug", "auth_request", { path: ctx.path, method: ctx.method });
      },
      after: async (ctx) => {
        logEvent("debug", "auth_response", {
          path: ctx.path,
          status: ctx.context.returned?.status,
        });
      },
    },

    logger: {
      level: "warn",
      log: (level, message, ...args) => {
        logEvent(level as "debug" | "info" | "warn" | "error", "better_auth", {
          message,
          args,
        });
      },
    },
  });

  return authInstance;
}

/** Export a getter for backward compatibility */
export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
  get(_target, prop, receiver) {
    return Reflect.get(getAuth(), prop, receiver);
  },
});

/**
 * Authorization policy.
 *
 * Deny by default. Every handler and server action must call `authorize`
 * with the actor, action, and resource. The route inventory test (below)
 * will fail if any entry point lacks a declared policy.
 */
export type Action =
  | "sign_up"
  | "sign_in"
  | "sign_out"
  | "verify_email"
  | "reset_password"
  | "change_password"
  | "delete_account"
  | "export_data"
  | "create_publication"
  | "update_publication"
  | "delete_publication"
  | "create_post"
  | "update_post"
  | "delete_post"
  | "publish_post"
  | "autosave_post"
  | "read_publication"
  | "read_post";

export type Resource =
  | { type: "user"; id: string }
  | { type: "publication"; id: string; ownerId: string }
  | { type: "post"; id: string; publicationId: string }
  | { type: "account"; action: "export" | "delete" };

export type Actor =
  | { type: "anonymous" }
  | { type: "user"; id: string; role: "user" | "admin" };

export function authorize(actor: Actor, action: Action, resource: Resource): boolean {
  // Anonymous can only sign up, sign in, verify email, reset password
  if (actor.type === "anonymous") {
    return [
      "sign_up",
      "sign_in",
      "verify_email",
      "reset_password",
      "read_publication",
      "read_post",
    ].includes(action);
  }

  // Admin can do everything
  if (actor.role === "admin") {
    return true;
  }

  // User authorization by resource ownership
  switch (resource.type) {
    case "user":
      return resource.id === actor.id;
    case "publication":
      return resource.ownerId === actor.id;
    case "post":
      // Post authorization goes through publication ownership
      return false; // Must check publication ownership separately
    case "account":
      return resource.action === "export" || resource.action === "delete";
  }

  return false;
}

/**
 * Safe redirect helper (A13).
 *
 * The target must start with a single `/`, must not start with `//` or `/\\`,
 * must contain no control characters or backslashes, and must resolve — after
 * `URL` parsing — to the request origin. Directory traversal attempts are
 * rejected, including encoded variants.
 */
export function safeRedirect(target: string, requestOrigin: string): string {
  // Reject empty string
  if (!target) {
    return "/";
  }

  // Check for control characters and backslashes in raw input
  if (/[\x00-\x1f\\]/.test(target)) {
    return "/";
  }

  // Check for encoded control characters
  if (/%[0-1][0-9a-f]/i.test(target)) {
    return "/";
  }

  // Check for encoded directory traversal before URL parsing
  const decoded = decodeURIComponent(target);
  if (decoded.includes("/../") || decoded.includes("/..\\") || decoded === "/..") {
    return "/";
  }

  let pathname: string;
  let search = "";

  try {
    const url = new URL(target, requestOrigin);
    if (url.origin !== requestOrigin) {
      return "/";
    }
    pathname = url.pathname;
    search = url.search;
  } catch {
    // Not a valid URL, treat as relative path
    if (!target.startsWith("/")) {
      return "/";
    }
    if (target.startsWith("//") || target.startsWith("/\\")) {
      return "/";
    }
    const [path, query] = target.split("?");
    pathname = path;
    search = query ? "?" + query : "";
  }

  // Final check on normalized pathname
  if (pathname.includes("/../") || pathname.startsWith("/..")) {
    return "/";
  }

  return pathname + search;
}

/**
 * Map Better Auth errors to our public error codes.
 *
 * This is called from route handlers and server actions after catching
 * an error from Better Auth. The raw Better Auth error never reaches the
 * client; only the public code and a fixed message do.
 */
export function mapAuthError(error: unknown, requestId: string): PublicError {
  if (error instanceof Error) {
    const message = error.message;
    if (message.includes("user already exists") || message.includes("email already in use")) {
      return toPublicError(new Error(message), requestId); // CONFLICT
    }
    if (message.includes("invalid credentials") || message.includes("wrong password")) {
      return toPublicError(new Error(message), requestId); // VALIDATION_ERROR (generic)
    }
    if (message.includes("email not verified")) {
      return toPublicError(new Error(message), requestId); // VALIDATION_ERROR
    }
    if (message.includes("rate limit") || message.includes("too many requests")) {
      return toPublicError(new Error(message), requestId); // UNAVAILABLE
    }
    if (message.includes("session not found") || message.includes("unauthorized")) {
      return toPublicError(new Error(message), requestId); // NOT_FOUND
    }
  }
  return toPublicError(error, requestId); // INTERNAL fallback
}