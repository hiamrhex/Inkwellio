import React from "react";
import Markdown from "react-markdown";
import { BODY_MAX_BYTES, byteLength } from "../validation";

export const MAX_MARKDOWN_BYTES = BODY_MAX_BYTES; // 102,400 bytes (100 KiB per A8)

/** Raised when untrusted Markdown input exceeds the A8 size ceiling. */
export class MarkdownLengthExceededError extends Error {
  readonly size: number;
  readonly limit: number;

  constructor(size: number, limit = MAX_MARKDOWN_BYTES) {
    super(`Markdown body exceeds ${limit} bytes (received ${size} bytes)`);
    this.name = "MarkdownLengthExceededError";
    this.size = size;
    this.limit = limit;
  }
}

/**
 * Validates that a URL uses only permitted protocols:
 * `https:`, `http:`, `mailto:`, or safe relative paths (`/`, `#`, `./`).
 * Rejects protocol-relative (`//`, `/\`), backslashes, and control characters.
 */
export function isSafeUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  const sanitized = url.trim().replace(/[\x00-\x1f\s]/g, "");
  if (sanitized === "") {
    return false;
  }

  if (sanitized.includes("\\")) {
    return false;
  }

  if (
    sanitized.startsWith("/") ||
    sanitized.startsWith("#") ||
    sanitized.startsWith("./")
  ) {
    if (sanitized.startsWith("//") || sanitized.startsWith("/\\")) {
      return false;
    }
    return true;
  }

  try {
    const parsed = new URL(sanitized, "http://localhost");
    return (
      parsed.protocol === "https:" ||
      parsed.protocol === "http:" ||
      parsed.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

export interface MarkdownRendererProps {
  content: string;
  allowImages?: boolean;
  className?: string;
}

/**
 * Server-only RSC Markdown renderer (ADR-008, A8).
 *
 * - Never uses `rehype-raw` or `dangerouslySetInnerHTML`: raw HTML in Markdown
 *   is escaped as text by React.
 * - Enforces `rel="noopener noreferrer nofollow ugc"` and URL allowlisting on links.
 * - Neutralizes images into plain links by default (`allowImages = false`)
 *   to prevent third-party IP tracking in v1.
 */
export function MarkdownRenderer({
  content,
  allowImages = false,
  className = "",
}: MarkdownRendererProps) {
  const bytes = byteLength(content);
  if (bytes > MAX_MARKDOWN_BYTES) {
    throw new MarkdownLengthExceededError(bytes);
  }

  return (
    <div className={`markdown-content ${className}`.trim()}>
      <Markdown
        components={{
          a({ href, children, ...props }) {
            const safeHref = isSafeUrl(href) ? href : "#";
            return (
              <a
                href={safeHref}
                rel="noopener noreferrer nofollow ugc"
                {...props}
              >
                {children}
              </a>
            );
          },
          img({ src, alt, ...props }) {
            if (!allowImages) {
              const safeHref = isSafeUrl(src) ? src : "#";
              return (
                <a
                  href={safeHref}
                  rel="noopener noreferrer nofollow ugc"
                  className="image-fallback-link"
                >
                  {alt || src || "Embedded Image"}
                </a>
              );
            }
            const safeSrc = isSafeUrl(src) ? src : undefined;
            if (safeSrc === undefined) {
              return <span>{alt || "Blocked Image"}</span>;
            }
            return (
              // External user-supplied URLs bypass Next Image domain static allowlist
              // eslint-disable-next-line @next/next/no-img-element
              <img src={safeSrc} alt={alt || ""} {...props} />
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
