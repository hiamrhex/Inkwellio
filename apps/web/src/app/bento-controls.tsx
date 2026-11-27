"use client";

import { useState, type ReactNode } from "react";

const SAMPLE_TOPICS = ["Tactics", "Match Reports", "Club History", "Culture"] as const;
const MAX_TOPICS = 3;

export function BentoLinkWidget({
  domainPrefix = "inkwellio.example/@",
}: {
  readonly domainPrefix?: string;
} = {}) {
  const [slugInput, setSlugInput] = useState("tactical-review");
  const normalizedSlug = slugInput
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return (
    <div
      style={{
        marginTop: "auto",
        padding: "1rem",
        background: "var(--bg-surface2)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <label
        htmlFor="bento-slug-input"
        style={{
          fontSize: "0.75rem",
          fontFamily: "var(--font-geist-mono)",
          color: "var(--text-faint)",
        }}
      >
        Live address preview
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: "0.875rem",
            fontFamily: "var(--font-geist-mono)",
            color: "var(--text-muted)",
          }}
        >
          {domainPrefix}
        </span>
        <input
          id="bento-slug-input"
          type="text"
          value={slugInput}
          onChange={(e) => setSlugInput(e.target.value)}
          placeholder="yourname"
          style={{
            flex: 1,
            minWidth: "120px",
            minHeight: "46px",
            height: "46px",
            background: "var(--bg-surface3)",
            border: "1px solid var(--border-hairline)",
            borderRadius: "0.5rem",
            padding: "0.5rem 0.75rem",
            fontSize: "0.875rem",
            fontFamily: "var(--font-geist-mono)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
      </div>
      <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)", color: "var(--text-faint)" }}>
        Your link:{" "}
        <span style={{ color: "var(--text-primary)" }}>
          {domainPrefix}{normalizedSlug || "yourname"}
        </span>
      </div>
    </div>
  );
}

export function BentoEditorWidget() {
  const [editorView, setEditorView] = useState<"formatted" | "markdown">("formatted");

  return (
    <div
      style={{
        marginTop: "auto",
        padding: "0.875rem 1rem",
        background: "var(--bg-surface2)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)", color: "var(--text-faint)" }}>
          Formatting view
        </span>
        <div
          style={{
            display: "inline-flex",
            background: "var(--bg-surface3)",
            padding: "2px",
            borderRadius: "9999px",
            border: "1px solid var(--border-hairline)",
          }}
        >
            <button
              type="button"
              onClick={() => setEditorView("formatted")}
              className="bento-pill-btn"
              style={{
                minHeight: "45px",
                minWidth: "45px",
                padding: "0 12px",
                fontSize: "0.75rem",
                borderRadius: "9999px",
                border: "none",
                cursor: "pointer",
                background: editorView === "formatted" ? "var(--btn-primary-bg)" : "transparent",
                color: editorView === "formatted" ? "var(--btn-primary-text)" : "var(--text-muted)",
              }}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => setEditorView("markdown")}
              className="bento-pill-btn"
              style={{
                minHeight: "45px",
                minWidth: "45px",
                padding: "0 12px",
                fontSize: "0.75rem",
                borderRadius: "9999px",
                border: "none",
                cursor: "pointer",
                background: editorView === "markdown" ? "var(--btn-primary-bg)" : "transparent",
                color: editorView === "markdown" ? "var(--btn-primary-text)" : "var(--text-muted)",
              }}
            >
              Plain text
            </button>
        </div>
      </div>

      <div
        style={{
          padding: "0.625rem 0.75rem",
          background: "var(--bg-surface1)",
          borderRadius: "0.375rem",
          border: "1px solid var(--border-hairline)",
          fontSize: "0.875rem",
          lineHeight: 1.5,
          fontFamily: editorView === "markdown" ? "var(--font-geist-mono)" : "var(--font-geist-sans)",
          color: "var(--text-primary)",
        }}
      >
        {editorView === "markdown" ? (
          <span>## The 64th minute — Inverted overload</span>
        ) : (
          <span style={{ fontWeight: 600 }}>The 64th minute — Inverted overload</span>
        )}
      </div>
    </div>
  );
}

export function BentoTopicsWidget({
  headerLeft,
  description,
  browseLink,
}: {
  readonly headerLeft: ReactNode;
  readonly description: ReactNode;
  readonly browseLink: ReactNode;
}) {
  const [selectedTopics, setSelectedTopics] = useState<string[]>(["Tactics", "Match Reports"]);

  const handleToggleTopic = (topic: string) => {
    setSelectedTopics((prev) => {
      if (prev.includes(topic)) {
        return prev.length > 1 ? prev.filter((item) => item !== topic) : prev;
      }
      if (prev.length >= MAX_TOPICS) {
        return [...prev.slice(1), topic];
      }
      return [...prev, topic];
    });
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        {headerLeft}
        <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)", color: "var(--text-faint)" }}>
          {selectedTopics.length} / {MAX_TOPICS} selected
        </span>
      </div>

      {description}

      <div
        style={{
          marginTop: "auto",
          padding: "0.875rem 1rem",
          background: "var(--bg-surface2)",
          border: "1px solid var(--border-hairline)",
          borderRadius: "0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.625rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
          {SAMPLE_TOPICS.map((topic) => {
            const active = selectedTopics.includes(topic);
            return (
              <button
                key={topic}
                type="button"
                aria-pressed={active}
                onClick={() => handleToggleTopic(topic)}
                className="bento-pill-btn"
                style={{
                  minHeight: "45px",
                  minWidth: "45px",
                  padding: "0 12px",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-geist-mono)",
                  borderRadius: "9999px",
                  border: "1px solid var(--border-hairline)",
                  cursor: "pointer",
                  background: active ? "var(--btn-primary-bg)" : "var(--bg-surface3)",
                  color: active ? "var(--btn-primary-text)" : "var(--text-muted)",
                }}
              >
                {topic}
              </button>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            fontSize: "0.75rem",
            fontFamily: "var(--font-geist-mono)",
            color: "var(--text-faint)",
          }}
        >
          <span>Channels: {selectedTopics.join(", ")}</span>
          {browseLink}
        </div>
      </div>
    </>
  );
}

export function BentoReadingWidget({
  headerLeft,
  headerCopy,
}: {
  readonly headerLeft: ReactNode;
  readonly headerCopy: ReactNode;
}) {
  const [fontFamily, setFontFamily] = useState<"serif" | "sans">("serif");
  const [fontSize, setFontSize] = useState<"17px" | "19px" | "21px">("19px");

  const handleSelectFont = (fam: "serif" | "sans") => {
    setFontFamily(fam);
    if (fam === "serif" && typeof document !== "undefined") {
      document.documentElement.classList.add("editorial-font-ready");
    }
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        {headerLeft}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              background: "var(--bg-surface3)",
              padding: "2px",
              borderRadius: "9999px",
              border: "1px solid var(--border-hairline)",
            }}
          >
            <button
              type="button"
              onClick={() => handleSelectFont("serif")}
              className="bento-pill-btn"
              style={{
                minHeight: "45px",
                minWidth: "45px",
                padding: "0 12px",
                fontSize: "0.75rem",
                borderRadius: "9999px",
                border: "none",
                cursor: "pointer",
                background: fontFamily === "serif" ? "var(--btn-primary-bg)" : "transparent",
                color: fontFamily === "serif" ? "var(--btn-primary-text)" : "var(--text-muted)",
              }}
            >
              Serif
            </button>
            <button
              type="button"
              onClick={() => handleSelectFont("sans")}
              className="bento-pill-btn"
              style={{
                minHeight: "45px",
                minWidth: "45px",
                padding: "0 12px",
                fontSize: "0.75rem",
                borderRadius: "9999px",
                border: "none",
                cursor: "pointer",
                background: fontFamily === "sans" ? "var(--btn-primary-bg)" : "transparent",
                color: fontFamily === "sans" ? "var(--btn-primary-text)" : "var(--text-muted)",
              }}
            >
              Sans
            </button>
          </div>

          <div
            style={{
              display: "inline-flex",
              background: "var(--bg-surface3)",
              padding: "2px",
              borderRadius: "9999px",
              border: "1px solid var(--border-hairline)",
            }}
          >
            {(["17px", "19px", "21px"] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setFontSize(sz)}
                className="bento-pill-btn"
                style={{
                  minHeight: "45px",
                  minWidth: "45px",
                  padding: "0 10px",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-geist-mono)",
                  borderRadius: "9999px",
                  border: "none",
                  cursor: "pointer",
                  background: fontSize === sz ? "var(--btn-primary-bg)" : "transparent",
                  color: fontSize === sz ? "var(--btn-primary-text)" : "var(--text-muted)",
                }}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>
      </div>

      {headerCopy}

      <div
        style={{
          marginTop: "auto",
          padding: "1rem",
          background: "var(--bg-surface2)",
          border: "1px solid var(--border-hairline)",
          borderRadius: "0.75rem",
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: fontFamily === "serif" ? "var(--font-editorial)" : "var(--font-geist-sans)",
            fontSize: fontSize,
            lineHeight: 1.7,
            color: "var(--text-primary)",
            maxWidth: "65ch",
          }}
        >
          Good match writing takes patience. Readers follow every move when the page stays calm.
        </p>
      </div>
    </>
  );
}
