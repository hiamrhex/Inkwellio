"use client";

import Markdown from "react-markdown";
import { BODY_MAX_BYTES, utf8ByteLength } from "./api";

/**
 * Client-side URL safety filter matching `modules/posts/render`:
 * permits `https:`, `http:`, `mailto:`, `/`, `#`, `./`, and rejects
 * protocol-relative URLs, backslashes, control chars, and `javascript:`/`data:`.
 */
export function isSafePreviewUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  const sanitized = url.trim().replace(/[\x00-\x1f\s]/g, "");
  if (sanitized === "" || sanitized.includes("\\")) {
    return false;
  }

  if (
    sanitized.startsWith("/") ||
    sanitized.startsWith("#") ||
    sanitized.startsWith("./")
  ) {
    return !(sanitized.startsWith("//") || sanitized.startsWith("/\\"));
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

export interface SafeMarkdownPreviewProps {
  readonly content: string;
}

/**
 * Safe client-side Markdown preview for the Studio write/preview toggle.
 * Never uses `rehype-raw` or `dangerouslySetInnerHTML`, escapes raw HTML as text,
 * enforces safe link protocols + `ugc` rel, and neutralizes remote images into links.
 */
export function SafeMarkdownPreview({ content }: SafeMarkdownPreviewProps) {
  const bytes = utf8ByteLength(content);
  if (bytes > BODY_MAX_BYTES) {
    return (
      <p
        role="status"
        className="rounded border p-4 text-sm"
        style={{
          borderColor: "var(--border-hairline)",
          backgroundColor: "var(--bg-surface2)",
          color: "var(--text-muted)",
        }}
      >
        Preview unavailable: Markdown body exceeds {BODY_MAX_BYTES.toLocaleString()} bytes.
      </p>
    );
  }

  if (content.trim() === "") {
    return (
      <p
        className="text-sm italic"
        style={{ color: "var(--text-faint)" }}
      >
        Nothing written yet. Switch back to Write to start drafting.
      </p>
    );
  }

  return (
    <div
      className="markdown-content space-y-4 leading-relaxed"
      style={{
        fontFamily: "var(--font-editorial, Georgia, serif)",
        color: "var(--text-primary)",
      }}
    >
      <Markdown
        components={{
          a({ href, children }) {
            const safeHref = isSafePreviewUrl(href) ? href : "#";
            return (
              <a
                href={safeHref}
                rel="noopener noreferrer nofollow ugc"
                className="underline underline-offset-4"
              >
                {children}
              </a>
            );
          },
          img({ src, alt }) {
            const safeHref = isSafePreviewUrl(src) ? src : "#";
            return (
              <a
                href={safeHref}
                rel="noopener noreferrer nofollow ugc"
                className="image-fallback-link underline underline-offset-4"
              >
                {alt || src || "Embedded Image"}
              </a>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
