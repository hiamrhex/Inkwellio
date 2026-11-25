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

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const isJson = contentType.includes("application/json");

  if (!isJson) {
    return {
      ok: false,
      status: response.status,
      code: response.status >= 500 ? "UNAVAILABLE" : "INVALID_RESPONSE",
      message:
        response.status >= 500
          ? "Service temporarily unavailable. Please try again shortly."
          : "Unexpected response format from server.",
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
        : response.status >= 500
          ? "UNAVAILABLE"
          : "REQUEST_FAILED";
    const message =
      typeof nested.message === "string" && nested.message.trim() !== ""
        ? nested.message
        : response.status === 401
          ? "Sign in to continue."
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
      details,
    };
  }

  return {
    ok: true,
    status: response.status,
    data: parsed as T,
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
