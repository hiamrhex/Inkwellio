"use client";

import { useState } from "react";
import { IconTile } from "@inkwellio/ui";

export function InteractiveBento() {
  const [slugInput, setSlugInput] = useState("tactical-review");
  const normalizedSlug = slugInput
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const [editorView, setEditorView] = useState<"formatted" | "markdown">("formatted");

  const [activeCheckpoint, setActiveCheckpoint] = useState<number>(0);
  const revisions = [
    {
      time: "10:04 (Current)",
      snippet:
        "In the 64th minute, City inverted their right-back into the inside channel, instantly overloading the midfield pivot.",
    },
    {
      time: "10:02",
      snippet:
        "In the second half, City shifted their defensive line higher, forcing the opposition winger to retreat deeper.",
    },
    {
      time: "10:00",
      snippet:
        "Tactical observations from the first half: high defensive block and structured wing overloads.",
    },
  ];

  const [fontFamily, setFontFamily] = useState<"serif" | "sans">("serif");
  const [fontSize, setFontSize] = useState<"17px" | "19px" | "21px">("19px");

  const handleSelectFont = (fam: "serif" | "sans") => {
    setFontFamily(fam);
    if (fam === "serif" && typeof document !== "undefined") {
      document.documentElement.classList.add("editorial-font-ready");
    }
  };

  return (
    <div
      className="bento-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gap: "1.5rem",
        marginTop: "2.25rem",
        width: "100%",
      }}
    >
      {/* ── Cell 1: Your Own Link (Span 7) ────────────────────────── */}
      <article
        className="spotlight-card bento-specular-card essential-card bento-cell-7 bento-cell-reveal"
        data-spotlight="true"
        aria-labelledby="bento-link-title"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <IconTile size={40}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 3v10M6 9l4-6 4 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 15h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </IconTile>
            <span className="essential-num">01 / Your link</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span className="status-dot status-dot-live" aria-hidden="true" />
            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)", color: "var(--text-faint)" }}>
              Direct bookmark
            </span>
          </div>
        </div>

        <div>
          <h3 className="essential-title" id="bento-link-title">Publish under your own link</h3>
          <p className="essential-body" style={{ marginTop: "0.5rem" }}>
            Your writing lives at a web address with your name in it. Readers bookmark you directly,
            subscribing to your publication instead of an algorithmic timeline.
          </p>
        </div>

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
              inkwellio.example/@
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
                minHeight: "44px",
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
            Normalized link: <span style={{ color: "var(--text-primary)" }}>inkwellio.example/@{normalizedSlug || "yourname"}</span>
          </div>
        </div>
      </article>

      {/* ── Cell 2: Distraction-Free Editor (Span 5) ───────────────── */}
      <article
        className="spotlight-card bento-specular-card essential-card bento-cell-5 bento-cell-reveal"
        data-spotlight="true"
        aria-labelledby="bento-editor-title"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <IconTile size={40}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 14.5L14.5 3L17 5.5L5.5 17L3 17.5L3 14.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
              </svg>
            </IconTile>
            <span className="essential-num">02 / Craft</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span className="status-dot status-dot-amber" aria-hidden="true" />
            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)", color: "var(--text-faint)" }}>
              Autosave active
            </span>
          </div>
        </div>

        <div>
          <h3 className="essential-title" id="bento-editor-title">Distraction-free editor</h3>
          <p className="essential-body" style={{ marginTop: "0.5rem" }}>
            A quiet markdown environment built for long reads. Save drafts, preview tactical layouts, and format passages cleanly.
          </p>
        </div>

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
                Rendered
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
                Markdown
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
      </article>

      {/* ── Cell 3: Automatic Revision History (Span 5) ───────────── */}
      <article
        className="spotlight-card bento-specular-card essential-card bento-cell-5 bento-cell-reveal"
        data-spotlight="true"
        aria-labelledby="bento-archive-title"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <IconTile size={40}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M3 8h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M7 12h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </IconTile>
            <span className="essential-num">03 / Revisions</span>
          </div>
          <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)", color: "var(--text-faint)" }}>
            Minute checkpoints
          </span>
        </div>

        <div>
          <h3 className="essential-title" id="bento-archive-title">Automatic revision history</h3>
          <p className="essential-body" style={{ marginTop: "0.5rem" }}>
            Every draft keeps its minute. Review earlier revisions with one click; nothing is ever overwritten by accident.
          </p>
        </div>

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
            {revisions.map((rev, idx) => (
              <button
                key={rev.time}
                type="button"
                onClick={() => setActiveCheckpoint(idx)}
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
                  background: activeCheckpoint === idx ? "var(--btn-primary-bg)" : "var(--bg-surface3)",
                  color: activeCheckpoint === idx ? "var(--btn-primary-text)" : "var(--text-muted)",
                  transition: "background 0.15s ease, color 0.15s ease, transform 0.1s ease",
                }}
              >
                {rev.time}
              </button>
            ))}
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "0.875rem",
              lineHeight: 1.55,
              color: "var(--text-muted)",
              fontFamily: "var(--font-editorial)",
              fontStyle: "italic",
            }}
          >
            &ldquo;{revisions[activeCheckpoint].snippet}&rdquo;
          </p>
        </div>
      </article>

      {/* ── Cell 4: Editorial Reading Comfort (Span 7) ────────────── */}
      <article
        className="spotlight-card bento-specular-card essential-card bento-cell-7 bento-cell-reveal"
        data-spotlight="true"
        aria-labelledby="bento-reading-title"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <IconTile size={40}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 7h4M10 7v6M8 13h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </IconTile>
            <span className="essential-num">04 / Comfort</span>
          </div>
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

        <div>
          <h3 className="essential-title" id="bento-reading-title">Editorial reading comfort</h3>
          <p className="essential-body" style={{ marginTop: "0.5rem" }}>
            Calibrated for 3,000-word tactical deep-dives. Balanced contrast prevents optical glare on dark screens, with generous line-height and reader-first typography.
          </p>
        </div>

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
            Tactical analysis requires optical patience. Readers absorb every minute detail when the typeface and measure respect their focus.
          </p>
        </div>
      </article>
    </div>
  );
}
