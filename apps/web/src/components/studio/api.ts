export interface ApiErrorDetails {
  readonly currentVersion?: number;
  readonly currentTitle?: string;
  readonly currentBodyMarkdown?: string;
  readonly updatedAt?: string | null;
}

export interface ApiFailure {
  readonly ok: false;
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  readonly details?: ApiErrorDetails;
}

export interface ApiSuccess<T> {
  readonly ok: true;
  readonly status: number;
  readonly data: T;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface RequestJsonOptions extends RequestInit {
  fetchImpl?: typeof fetch;
}

export const TITLE_MAX_CHARS = 200;
export const BODY_MAX_BYTES = 102_400;
export const MAX_TOPIC_SELECTIONS = 3;

const textEncoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

export function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * Generates an opaque idempotency request header for lifecycle mutations.
 */
export function createRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `studio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const RESERVED_HANDLE_SLUGS = new Set([
  "about",
  "account",
  "admin",
  "api",
  "auth",
  "dashboard",
  "explore",
  "feed",
  "forgot-password",
  "health",
  "help",
  "history",
  "legal",
  "login",
  "logout",
  "new",
  "p",
  "privacy",
  "publications",
  "reset-password",
  "search",
  "settings",
  "sign-in",
  "sign-up",
  "signin",
  "signup",
  "status",
  "studio",
  "support",
  "terms",
  "topics",
  "u",
  "user",
  "verify-email",
]);

/**
 * Normalizes a custom publication handle input for live URL previews.
 */
export function normalizeHandleInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

/**
 * Pure client-side handle preview matching the server's NFKD publication slug rule.
 */
export function slugifyHandlePreview(input: string): string {
  const normalized = input
    .normalize("NFKD")
    .replace(/ß/g, "ss")
    .replace(/[æÆ]/g, "ae")
    .replace(/[œŒ]/g, "oe")
    .replace(/[øØ]/g, "o")
    .replace(/[łŁ]/g, "l")
    .replace(/[\u0300-\u036f]/g, "");
  let slug = normalizeHandleInput(normalized);
  if (!slug) return "";
  if (RESERVED_HANDLE_SLUGS.has(slug)) {
    slug = `${slug.slice(0, 60).replace(/-+$/g, "")}-pub`;
  }
  return slug;
}

/**
 * Parses an integer or HTTP-date `Retry-After` header into bounded positive seconds.
 */
export function parseRetryAfterSeconds(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    return parsed > 0 ? Math.min(parsed, 86_400) : 1;
  }
  const timestamp = Date.parse(trimmed);
  if (Number.isFinite(timestamp)) {
    const deltaSeconds = Math.ceil((timestamp - Date.now()) / 1000);
    return deltaSeconds > 0 ? Math.min(deltaSeconds, 86_400) : 1;
  }
  return undefined;
}

/**
 * Formats an `ApiFailure` into an honest, actionable UI status message
 * preserving rate-limit cooldown guidance and 5xx request references.
 */
export function formatApiFailure(failure: ApiFailure): string {
  if (failure.status === 0) {
    return "Offline or unreachable server. Keep this tab open and try again once connected.";
  }
  if (failure.status === 401) {
    return "Your session expired. Sign in again to continue.";
  }
  if (failure.status === 429) {
    if (failure.retryAfterSeconds && failure.retryAfterSeconds > 0) {
      return `Too many requests right now. Pause for ${failure.retryAfterSeconds}s before trying again.`;
    }
    return "Too many requests right now. Pause briefly and try again.";
  }
  if (failure.status === 413) {
    return failure.message || "Export exceeds the 25 MB browser download limit.";
  }
  if (failure.status >= 500) {
    return failure.requestId
      ? `${failure.message} (Reference: ${failure.requestId})`
      : failure.message;
  }
  return failure.message;
}

/**
 * Layer 64 safe JSON client helper:
 * checks HTTP status and `content-type` BEFORE parsing JSON so non-JSON
 * error pages (e.g. proxy 500 HTML/text) never surface raw `SyntaxError`.
 */
export async function requestJson<T>(
  url: string,
  options: RequestJsonOptions = {},
): Promise<ApiResponse<T>> {
  const { fetchImpl = fetch, headers: rawHeaders, ...rest } = options;
  const headers = new Headers(rawHeaders);

  if (rest.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (rest.method && rest.method.toUpperCase() !== "GET" && !headers.has("x-request-id")) {
    headers.set("x-request-id", createRequestId());
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...rest,
      headers,
      credentials: "same-origin",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: "UNAVAILABLE",
      message: "Network request could not reach the server. Please try again.",
    };
  }

  const retryAfterSeconds =
    response.status === 429
      ? parseRetryAfterSeconds(response.headers.get("retry-after"))
      : undefined;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const isJson = contentType.includes("application/json");

  if (!isJson) {
    return {
      ok: false,
      status: response.status,
      code:
        response.status === 429
          ? "RATE_LIMITED"
          : response.status >= 500
            ? "UNAVAILABLE"
            : "INVALID_RESPONSE",
      message:
        response.status === 429
          ? "Too many requests right now. Please wait before trying again."
          : response.status >= 500
            ? "Service temporarily unavailable. Please try again shortly."
            : "Unexpected response format from server.",
      retryAfterSeconds,
    };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return {
      ok: false,
      status: response.status,
      code: response.status >= 500 ? "UNAVAILABLE" : "INVALID_RESPONSE",
      message: "Could not read response from server.",
      retryAfterSeconds,
    };
  }

  if (!response.ok) {
    const obj =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    const nested =
      typeof obj.error === "object" && obj.error !== null
        ? (obj.error as Record<string, unknown>)
        : obj;

    const code =
      typeof nested.code === "string"
        ? nested.code
        : response.status === 429
          ? "RATE_LIMITED"
          : response.status >= 500
            ? "UNAVAILABLE"
            : "REQUEST_FAILED";
    const message =
      typeof nested.message === "string" && nested.message.trim() !== ""
        ? nested.message
        : response.status === 401
          ? "Sign in to continue."
          : response.status === 429
            ? "Too many requests right now. Please wait before trying again."
            : "Request could not be completed.";
    const requestId =
      typeof nested.requestId === "string" ? nested.requestId : undefined;
    const details =
      typeof obj.details === "object" && obj.details !== null
        ? (obj.details as ApiErrorDetails)
        : undefined;

    return {
      ok: false,
      status: response.status,
      code,
      message,
      requestId,
      retryAfterSeconds,
      details,
    };
  }

  return {
    ok: true,
    status: response.status,
    data: parsed as T,
  };
}

export interface ExportDownloadSuccess {
  readonly ok: true;
  readonly filename: string;
  readonly jsonText: string;
}

/**
 * Fetches `GET /api/account/export` with the Layer 64 safety checks (`401`, `413`, `429`, `503`),
 * returning raw pretty-printed JSON and its Content-Disposition filename.
 */
export async function requestAccountExportDownload(
  fetchImpl: typeof fetch = fetch,
): Promise<ExportDownloadSuccess | ApiFailure> {
  let response: Response;
  try {
    response = await fetchImpl("/api/account/export", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: "UNAVAILABLE",
      message: "Network request could not reach the server. Please try again.",
    };
  }

  const retryAfterSeconds =
    response.status === 429
      ? parseRetryAfterSeconds(response.headers.get("retry-after"))
      : undefined;
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    if (!isJson) {
      return {
        ok: false,
        status: response.status,
        code: response.status === 429 ? "RATE_LIMITED" : "UNAVAILABLE",
        message:
          response.status === 429
            ? "Too many export requests right now."
            : "Export service temporarily unavailable. Please try again shortly.",
        retryAfterSeconds,
      };
    }
    try {
      const errObj = (await response.json()) as Record<string, unknown>;
      return {
        ok: false,
        status: response.status,
        code:
          typeof errObj.code === "string"
            ? errObj.code
            : response.status === 413
              ? "PAYLOAD_TOO_LARGE"
              : "REQUEST_FAILED",
        message:
          typeof errObj.message === "string" && errObj.message.trim() !== ""
            ? errObj.message
            : response.status === 413
              ? "Export exceeds the 25 MB limit."
              : "Could not download account export.",
        requestId: typeof errObj.requestId === "string" ? errObj.requestId : undefined,
        retryAfterSeconds,
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        code: "INVALID_RESPONSE",
        message: "Could not read response from server.",
        retryAfterSeconds,
      };
    }
  }

  if (!isJson) {
    return {
      ok: false,
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "Unexpected export format from server.",
    };
  }

  const jsonText = await response.text();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";\r\n]+)"?/i);
  const filename = match?.[1]?.trim() || "inkwellio-export.json";

  return {
    ok: true,
    filename,
    jsonText,
  };
}

/**
 * Toggles a curated topic slug while enforcing the ADR-012 3-topic ceiling.
 */
export function toggleTopicSelection(
  selected: readonly string[],
  slug: string,
  maxTopics = MAX_TOPIC_SELECTIONS,
): { readonly next: string[]; readonly atLimit: boolean } {
  if (selected.includes(slug)) {
    return {
      next: selected.filter((item) => item !== slug),
      atLimit: false,
    };
  }
  if (selected.length >= maxTopics) {
    return {
      next: [...selected],
      atLimit: true,
    };
  }
  return {
    next: [...selected, slug],
    atLimit: false,
  };
}
