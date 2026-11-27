/**
 * Client-safe helpers for auth forms. Never imports @/modules/identity (server-only).
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const RATE_LIMIT_MESSAGE = "Too many attempts. Try again in a few minutes.";
export const EMAIL_FAILED_MESSAGE = "We could not send the email. Try again shortly.";
export const INVALID_CREDENTIALS_MESSAGE =
  "Check your email and password. We could not sign you in.";
export const VALIDATION_MESSAGE = "Check your details and try again.";
export const ORIGIN_ERROR_MESSAGE =
  "This web address is not allowed here. Open the app URL and try again.";

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
 * Normalizes auth HTTP responses into safe, plain, non-enumerating messages.
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
  let textSnippet = "";
  try {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      body = (await response.json()) as RawAuthErrorBody;
    } else {
      textSnippet = (await response.text()).slice(0, 200);
    }
  } catch {
    body = null;
  }

  const rawCode = typeof body?.code === "string" ? body.code.toUpperCase() : "";
  const rawMessage =
    typeof body?.message === "string"
      ? body.message
      : typeof body?.error === "string"
        ? body.error
        : textSnippet;

  if (
    rawCode === "TOO_MANY_REQUESTS" ||
    rawCode === "RATE_LIMITED" ||
    /too many requests|rate limit/i.test(rawMessage)
  ) {
    return { message: RATE_LIMIT_MESSAGE, code: "RATE_LIMITED" };
  }

  if (
    rawCode === "INVALID_ORIGIN" ||
    rawCode === "MISSING_OR_NULL_ORIGIN" ||
    /invalid origin|missing or null origin/i.test(rawMessage)
  ) {
    return { message: ORIGIN_ERROR_MESSAGE, code: rawCode || "INVALID_ORIGIN" };
  }

  const isEmailDeliveryFailure =
    rawCode.includes("EMAIL_DELIVERY") ||
    rawCode === "EMAIL_NOT_SENT" ||
    /email delivery failed|could not send.*email|failed to send.*email|smtp/i.test(rawMessage) ||
    (response.status >= 500 &&
      (kind === "verify-email" || kind === "forgot-password" || kind === "sign-up"));

  if (isEmailDeliveryFailure) {
    return {
      message: EMAIL_FAILED_MESSAGE,
      code: rawCode || "EMAIL_DELIVERY_FAILED",
    };
  }

  if (kind === "sign-in") {
    if (
      rawCode === "EMAIL_NOT_VERIFIED" ||
      /email not verified/i.test(rawMessage)
    ) {
      return {
        message: "Verify your email before signing in. You can request a fresh link below.",
        code: "EMAIL_NOT_VERIFIED",
      };
    }
    if (
      response.status === 401 ||
      rawCode === "INVALID_EMAIL_OR_PASSWORD" ||
      rawCode === "INVALID_CREDENTIALS" ||
      rawCode === "USER_NOT_FOUND"
    ) {
      return {
        message: INVALID_CREDENTIALS_MESSAGE,
        code: rawCode || "INVALID_CREDENTIALS",
      };
    }
  }

  if (kind === "reset-password") {
    if (
      rawCode === "INVALID_TOKEN" ||
      rawCode === "TOKEN_EXPIRED" ||
      /invalid.*token|expired/i.test(rawMessage)
    ) {
      return {
        message: "This reset link is invalid or has expired. Request a new one below.",
        code: rawCode || "INVALID_TOKEN",
      };
    }
  }

  if (rawCode.includes("PASSWORD") || /password/i.test(rawMessage)) {
    if (response.status === 400 || response.status === 422 || rawCode === "VALIDATION_ERROR") {
      return {
        message: "Choose a password between 8 and 128 characters.",
        code: rawCode || "VALIDATION_ERROR",
      };
    }
  }

  if (rawCode === "INVALID_EMAIL" || /\[body\.email\]|invalid email/i.test(rawMessage)) {
    return {
      message: "Enter a valid email address.",
      code: rawCode || "VALIDATION_ERROR",
    };
  }

  if (
    kind === "sign-up" &&
    (response.status === 409 ||
      rawCode === "USER_ALREADY_EXISTS" ||
      rawCode === "CONFLICT" ||
      /already exists/i.test(rawMessage))
  ) {
    return {
      message: "Check your details or sign in if you already have an account.",
      code: rawCode || "CONFLICT",
    };
  }

  if (response.status === 400 || response.status === 422 || rawCode === "VALIDATION_ERROR") {
    return {
      message: VALIDATION_MESSAGE,
      code: rawCode || "VALIDATION_ERROR",
    };
  }

  return {
    message: fallbackMessage,
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
