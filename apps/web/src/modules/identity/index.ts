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
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  toPublicError,
  type PublicError,
} from "@/kernel/errors";
import { users, sessions, accounts, verifications, rateLimits } from "./schema";
import { sendVerificationEmail, sendResetPasswordEmail } from "./email";
import { rateLimitAuth } from "./limiter";

// Re-export for other modules
export { ForbiddenError, users, sessions, accounts, verifications, rateLimits };
export * from "./limiter";
export * from "./audit";
export * from "./email";

/**
 * Lazy Better Auth instance.
 *
 * Created on first access so that tests can run without BETTER_AUTH_SECRET
 * and BETTER_AUTH_URL being set. The Drizzle adapter uses our existing
 * `users` table (mapped to `user` in the adapter). Better Auth will create
 * its own `session`, `account`, `verification`, and `rateLimit` tables on
 * migration.
 */
let authInstance: unknown | null = null;

export function getAuth() {
  if (authInstance !== null) {
    return authInstance as ReturnType<typeof betterAuth>;
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

    database: drizzleAdapter(
      process.env.DATABASE_URL ? getDb() : ({} as ReturnType<typeof getDb>),
      {
        provider: "pg",
        schema: {
          user: users,
          users,
          session: sessions,
          sessions,
          account: accounts,
          accounts,
          verification: verifications,
          verifications,
          rateLimit: rateLimits,
          rate_limit: rateLimits,
          rate_limits: rateLimits,
        },
        usePlural: true,
      },
    ),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: false,
      sendResetPassword: async ({ user, url, token }) => {
        await sendResetPasswordEmail({ user, url, token });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url, token }) => {
        await sendVerificationEmail({ user, url, token });
      },
    },

    session: {
      modelName: "session",
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
      storeSessionInDatabase: true,
      cookieCache: {
        enabled: false,
      },
    },

    account: {
      modelName: "account",
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
    },

    verification: {
      storeIdentifier: "hashed",
      storeInDatabase: true,
    },

    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": {
          window: 600,
          max: 5,
        },
      },
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
        logEvent("debug", "auth_request", { path: (ctx as unknown as { path: string }).path, method: (ctx as unknown as { method: string }).method });
        return { context: ctx };
      },
      after: async (ctx) => {
        logEvent("debug", "auth_response", {
          path: (ctx as unknown as { path: string }).path,
          status: (ctx as unknown as { context?: { returned?: { status?: string } } }).context?.returned?.status,
        });
        return {};
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

  return authInstance as ReturnType<typeof betterAuth>;
}

/** Export a getter for backward compatibility */
export const auth = new Proxy({} as Record<string, unknown>, {
  get(_target, prop, receiver) {
    const authInstance = getAuth();
    return authInstance ? Reflect.get(authInstance, prop, receiver) : undefined;
  },
});

const RATE_LIMITED_AUTH_PATHS = new Set([
  "sign-in/email",
  "sign-up/email",
  "forget-password",
  "request-password-reset",
  "reset-password",
  "send-verification-email",
]);

/**
 * Next.js App Router GET handler for `/api/auth/[...all]`.
 *
 * Kept inside `modules/identity` so `app/` never imports Better Auth directly.
 */
export async function handleAuthGet(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

/**
 * Next.js App Router POST handler for `/api/auth/[...all]`.
 *
 * Enforces application-layer rate limiting (pinned `x-vercel-forwarded-for` +
 * normalized email) before delegating to Better Auth's handler.
 */
export async function handleAuthPost(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const subPath = url.pathname.replace(/^\/api\/auth\/?/, "");

  if (RATE_LIMITED_AUTH_PATHS.has(subPath)) {
    let email: string | undefined;
    try {
      const cloned = request.clone();
      const body = (await cloned.json()) as { email?: unknown };
      if (typeof body?.email === "string") {
        email = body.email;
      }
    } catch {
      // Non-JSON or empty body; IP rate limit still applies
    }

    const limitResult = await rateLimitAuth(
      `auth:${subPath}`,
      { headers: request.headers, email },
      { max: 5, windowSeconds: 600 },
    );
    if (!limitResult.allowed) {
      return Response.json(
        { code: "RATE_LIMITED", message: "Too many requests" },
        { status: 429 },
      );
    }
  }

  return getAuth().handler(request);
}

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

export type PostStatus = "draft" | "published" | "deleted";

export type Resource =
  | { type: "user"; id: string }
  | { type: "publication"; id: string; ownerId: string }
  | {
      type: "post";
      id: string;
      publicationId: string;
      ownerId: string;
      status: PostStatus;
    }
  | { type: "account"; action: "export" | "delete"; userId: string };

export type Actor =
  | { type: "anonymous" }
  | { type: "user"; id: string; role: "user" | "admin" };

export function authorize(actor: Actor, action: Action, resource: Resource): boolean {
  // Public actions permitted to anyone (anonymous or authenticated)
  if (["sign_up", "sign_in", "verify_email", "reset_password", "read_publication"].includes(action)) {
    return true;
  }

  // Post reads depend on publication status and ownership (identity-api.md §3)
  if (action === "read_post" && resource.type === "post") {
    if (resource.status === "published") {
      return true;
    }
    if (actor.type === "anonymous") {
      return false;
    }
    return actor.role === "admin" || resource.ownerId === actor.id;
  }

  // Anonymous cannot perform any other action
  if (actor.type === "anonymous") {
    return false;
  }

  // Sign out is permitted to any authenticated user
  if (action === "sign_out") {
    return true;
  }

  // Account export and deletion are strictly self-service for the account owner
  if (resource.type === "account") {
    return (
      actor.type === "user" &&
      resource.userId === actor.id &&
      (resource.action === "export" || resource.action === "delete")
    );
  }

  // Admin can do everything else
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
      if (
        action === "update_post" ||
        action === "publish_post" ||
        action === "autosave_post" ||
        action === "delete_post"
      ) {
        return resource.ownerId === actor.id;
      }
      return false;
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

  // Check for encoded directory traversal, control chars, or backslashes before URL parsing
  let decoded: string;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return "/";
  }
  if (
    /[\x00-\x1f\\]/.test(decoded) ||
    decoded.includes("/../") ||
    decoded.includes("/..\\") ||
    decoded === "/.."
  ) {
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
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "";

  const code =
    typeof error === "object" && error !== null
      ? ((error as { code?: string }).code ??
         (error as { cause?: { code?: string } }).cause?.code)
      : undefined;

  const lowerMsg = message.toLowerCase();
  const upperCode = code?.toUpperCase() ?? "";

  // Duplicate / conflict
  if (
    code === "23505" ||
    lowerMsg.includes("23505") ||
    lowerMsg.includes("unique constraint") ||
    lowerMsg.includes("user already exists") ||
    lowerMsg.includes("email already in use")
  ) {
    return toPublicError(new ConflictError("That already exists"), requestId);
  }

  // Authentication failure / account enumeration protection (G6)
  // Maps all credential / unknown user / bad password / unverified failures to identical 400 VALIDATION_ERROR
  if (
    upperCode === "USER_NOT_FOUND" ||
    upperCode === "INVALID_EMAIL_OR_PASSWORD" ||
    upperCode === "INVALID_CREDENTIALS" ||
    lowerMsg.includes("user_not_found") ||
    lowerMsg.includes("invalid_email_or_password") ||
    lowerMsg.includes("user not found") ||
    lowerMsg.includes("user does not exist") ||
    lowerMsg.includes("account not found") ||
    lowerMsg.includes("invalid credentials") ||
    lowerMsg.includes("wrong password") ||
    lowerMsg.includes("invalid email or password") ||
    lowerMsg.includes("email not verified")
  ) {
    return toPublicError(new ValidationError("Invalid input"), requestId);
  }

  // Rate limiting
  if (
    upperCode === "RATE_LIMITED" ||
    upperCode === "TOO_MANY_REQUESTS" ||
    lowerMsg.includes("rate limit") ||
    lowerMsg.includes("too many requests")
  ) {
    return toPublicError(Object.assign(new Error(message), { code: "57014" }), requestId);
  }

  // Session / resource not found
  if (lowerMsg.includes("session not found") || lowerMsg.includes("unauthorized")) {
    return toPublicError(new NotFoundError("Not found"), requestId);
  }

  return toPublicError(error, requestId); // INTERNAL fallback
}