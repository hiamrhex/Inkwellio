/**
 * Client-safe helpers for auth forms. Never imports @/modules/identity (server-only).
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const RATE_LIMIT_MESSAGE = "Too many attempts. Try again in a few minutes.";

export interface AuthErrorResult {
  readonly message: string;
  readonly code?: string;
}

interface RawAuthErrorBody {
  code?: unknown;
  message?: unknown;
  error?: unknown;
}

/**
 * Normalizes auth HTTP responses into safe, user-facing, non-enumerating errors.
 */
export async function parseAuthError(
  response: Response,
  fallbackMessage: string,
  kind: "sign-in" | "sign-up" | "verify-email" | "forgot-password" | "reset-password",
): Promise<AuthErrorResult> {
  if (response.status === 429) {
    return { message: RATE_LIMIT_MESSAGE, code: "RATE_LIMITED" };
  }

  let body: RawAuthErrorBody | null = null;
  try {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      body = (await response.json()) as RawAuthErrorBody;
    }
  } catch {
    body = null;
  }

  const rawCode = typeof body?.code === "string" ? body.code : "";
  const rawMessage =
    typeof body?.message === "string"
      ? body.message
      : typeof body?.error === "string"
        ? body.error
        : "";

  if (kind === "sign-in") {
    if (rawCode === "EMAIL_NOT_VERIFIED" || response.status === 403) {
      return {
        message: "Please verify your email address before signing in. You can request a fresh verification link.",
        code: "EMAIL_NOT_VERIFIED",
      };
    }
    if (response.status === 401 || rawCode.includes("INVALID")) {
      return {
        message: "We could not sign you in with that email and password.",
        code: rawCode || "INVALID_CREDENTIALS",
      };
    }
  }

  if (kind === "reset-password") {
    if (
      rawCode === "INVALID_TOKEN" ||
      rawCode === "TOKEN_EXPIRED" ||
      /invalid|expired/i.test(rawMessage)
    ) {
      return {
        message: "This password reset link is invalid or has expired. Request a new reset link below.",
        code: rawCode || "INVALID_TOKEN",
      };
    }
  }

  if (kind === "sign-up") {
    if (rawCode.includes("PASSWORD")) {
      return {
        message: "Choose a password between 8 and 128 characters.",
        code: rawCode,
      };
    }
    return {
      message: fallbackMessage,
      code: rawCode || undefined,
    };
  }

  return {
    message: rawMessage && response.status >= 400 && response.status < 500 ? rawMessage : fallbackMessage,
    code: rawCode || undefined,
  };
}

export function isValidEmailFormat(value: string): boolean {
  const trimmed = value.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at >= trimmed.length - 3) return false;
  const domain = trimmed.slice(at + 1);
  return domain.includes(".") && !/\s/.test(trimmed);
}

/**
 * Moves keyboard focus directly to the first field with an error.
 */
export function focusFirstInvalidField(fieldIds: readonly string[]): void {
  for (const id of fieldIds) {
    const el = document.getElementById(id);
    if (el instanceof HTMLElement) {
      el.focus();
      return;
    }
  }
}
