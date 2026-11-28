"use client";

import { useEffect, useRef, useState } from "react";

const AUTO_TEXT =
  "In the 64th minute, City tucked their right-back inside. That move broke the press and opened the middle lane.";

export function LivingHeroArtifact() {
  const [mode, setMode] = useState<"write" | "read">("write");
  const [typedText, setTypedText] = useState("");
  const [isInteractive, setIsInteractive] = useState(false);
  const [userText, setUserText] = useState(AUTO_TEXT);
  const [isReduced, setIsReduced] = useState(false);
  const charIndexRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncFrozen = () => {
      const attr = document.documentElement.getAttribute("data-motion");
      setIsReduced(attr === "paused" || (attr !== "active" && mq.matches));
    };
    const raf = requestAnimationFrame(syncFrozen);
    const mo = new MutationObserver(syncFrozen);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    mq.addEventListener("change", syncFrozen);
    window.addEventListener("inkwellio:motion-change", syncFrozen);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      mq.removeEventListener("change", syncFrozen);
      window.removeEventListener("inkwellio:motion-change", syncFrozen);
    };
  }, []);

  // Gradual character-by-character live auto-typing cadence inside the hero editor
  useEffect(() => {
    if (mode !== "write" || isInteractive || isReduced) {
      return;
    }

    charIndexRef.current = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startTimer = setTimeout(() => {
      intervalId = setInterval(() => {
        if (charIndexRef.current < AUTO_TEXT.length) {
          charIndexRef.current++;
          setTypedText(AUTO_TEXT.slice(0, charIndexRef.current));
        } else if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }, 42);
    }, 1400);

    return () => {
      clearTimeout(startTimer);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, [mode, isInteractive, isReduced]);

  const enterInteractiveMode = () => {
    if (!isInteractive) {
      setIsInteractive(true);
      setUserText(typedText || AUTO_TEXT);
    }
  };

  const handleResetAutoType = () => {
    setIsInteractive(false);
    charIndexRef.current = 0;
    setTypedText("");
  };

  const handleSelectMode = (newMode: "write" | "read") => {
    setMode(newMode);
    if (newMode === "read" && typeof document !== "undefined") {
      document.documentElement.classList.add("editorial-font-ready");
    }
    if (newMode === "write") {
      charIndexRef.current = 0;
      setTypedText("");
    }
  };

  const displayedTypedText = isReduced ? AUTO_TEXT : typedText;
  const activeContent = isInteractive ? userText : displayedTypedText;
  const wordCount = activeContent.trim() ? activeContent.trim().split(/\s+/).length : 0;
  const readTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div
      className="hero-artifact-container"
      data-tilt-hero="true"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "520px",
        paddingTop: "3.25rem",
        paddingBottom: "3.25rem",
        transformStyle: "preserve-3d",
        margin: "0 auto",
      }}
    >
      {/* Compact Top-Left Floating Status Pill (<= 44px height) */}
      <div
        className="hero-float-card hero-float-card-1"
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "0.125rem",
          bottom: "auto",
          left: "0",
          right: "auto",
          display: "inline-flex",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: "0.45rem",
          width: "fit-content",
          height: "fit-content",
          maxHeight: "40px",
          maxWidth: "100%",
          whiteSpace: "nowrap",
          background: "var(--bg-surface2)",
          border: "1px solid var(--border-hairline)",
          borderRadius: "9999px",
          padding: "0.375rem 0.875rem",
          boxShadow: "inset 0 1px 0 0 var(--rim-specular), var(--shadow-card)",
          fontSize: "0.75rem",
          zIndex: 10,
        }}
      >
        <span className="status-dot status-dot-amber" />
        <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>Draft saved</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500, fontFamily: "var(--font-code)" }}>
          v3 safe
        </span>
      </div>

      {/* Main 3D Tilted Monolith Card Body (thick surface, no heavy backdrop-filter over animating canvas) */}
      <div
        className="hero-form-body hero-living-card hero-scroll-card"
        style={{
          transformStyle: "preserve-3d",
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: "100%",
          borderRadius: "1.25rem",
          background: "var(--hero-card-bg, var(--bg-surface1))",
          border: "1px solid var(--border-hairline)",
          boxShadow: "inset 0 1px 0 0 var(--rim-specular), var(--shadow-card)",
          padding: "1.25rem 1.375rem",
          minHeight: "340px",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}
      >
        {/* Dynamic Specular Gradient Highlight */}
        <div className="hero-form-specular" aria-hidden="true" />

        {/* Crisp 1px top-edge specular rim line */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: "12%",
            right: "12%",
            height: "1px",
            background: "linear-gradient(90deg, transparent, var(--rim-edge), transparent)",
            pointerEvents: "none",
          }}
        />

        {/* Toolbar with [Write] / [Read] Segmented Switcher */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "nowrap",
            gap: "0.5rem",
            paddingBottom: "0.75rem",
            borderBottom: "1px solid var(--border-hairline)",
            position: "relative",
            zIndex: 2,
            minWidth: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--border-hairline)",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--border-hairline)",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-code)",
                color: "var(--text-muted)",
                marginLeft: "0.2rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Draft: City away leg
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Editor view mode"
            style={{
              display: "inline-flex",
              flexShrink: 0,
              background: "var(--bg-surface3)",
              padding: "2px",
              borderRadius: "9999px",
              border: "1px solid var(--border-hairline)",
            }}
          >
            <button
              role="tab"
              type="button"
              id="tab-write"
              aria-selected={mode === "write"}
              aria-controls="panel-write"
              onClick={() => handleSelectMode("write")}
              className="bento-pill-btn"
              style={{
                minHeight: "45px",
                minWidth: "46px",
                padding: "0 11px",
                fontSize: "0.75rem",
                fontWeight: 500,
                borderRadius: "9999px",
                border: "none",
                cursor: "pointer",
                background: mode === "write" ? "var(--btn-primary-bg)" : "transparent",
                color: mode === "write" ? "var(--btn-primary-text)" : "var(--text-muted)",
              }}
            >
              Write
            </button>
            <button
              role="tab"
              type="button"
              id="tab-read"
              aria-selected={mode === "read"}
              aria-controls="panel-read"
              onClick={() => handleSelectMode("read")}
              className="bento-pill-btn"
              style={{
                minHeight: "45px",
                minWidth: "46px",
                padding: "0 11px",
                fontSize: "0.75rem",
                fontWeight: 500,
                borderRadius: "9999px",
                border: "none",
                cursor: "pointer",
                background: mode === "read" ? "var(--btn-primary-bg)" : "transparent",
                color: mode === "read" ? "var(--btn-primary-text)" : "var(--text-muted)",
              }}
            >
              Read
            </button>
          </div>
        </div>

        {/* Panels */}
        {mode === "write" ? (
          <div
            id="panel-write"
            role="tabpanel"
            aria-labelledby="tab-write"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              position: "relative",
              zIndex: 2,
              minWidth: 0,
            }}
          >
            <span className="sr-only">{AUTO_TEXT}</span>

            <div
              onClick={enterInteractiveMode}
              onFocus={enterInteractiveMode}
              tabIndex={isInteractive ? -1 : 0}
              role={isInteractive ? undefined : "button"}
              aria-label={isInteractive ? undefined : "Click or focus to type your own draft preview"}
              style={{
                flex: 1,
                cursor: isInteractive ? "text" : "pointer",
                position: "relative",
                minHeight: "160px",
                minWidth: 0,
                borderRadius: "0.5rem",
              }}
            >
              {isInteractive ? (
                <textarea
                  value={userText}
                  onChange={(e) => setUserText(e.target.value)}
                  aria-label="Live interactive editor draft"
                  autoFocus
                  style={{
                    width: "100%",
                    height: "100%",
                    minHeight: "160px",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    resize: "none",
                    fontFamily: "var(--font-ui)",
                    fontSize: "0.9375rem",
                    lineHeight: 1.65,
                    color: "var(--text-primary)",
                    padding: 0,
                  }}
                />
              ) : (
                <div
                  aria-hidden="true"
                  data-hero-typed-preview="true"
                  style={{
                    fontSize: "0.9375rem",
                    lineHeight: 1.65,
                    color: "var(--text-primary)",
                    wordBreak: "break-word",
                  }}
                >
                  {displayedTypedText}
                  <span
                    className="blinking-caret"
                    style={{
                      display: "inline-block",
                      width: "1.5px",
                      height: "1.1em",
                      background: "var(--text-primary)",
                      marginLeft: "2px",
                      verticalAlign: "text-bottom",
                    }}
                  />
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem 0.75rem",
                paddingTop: "0.75rem",
                borderTop: "1px solid var(--border-hairline)",
                fontSize: "0.75rem",
                fontFamily: "var(--font-code)",
                color: "var(--text-faint)",
                minWidth: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="status-dot status-dot-amber" />
                <span>{isInteractive ? "Interactive mode" : "Illustration"}</span>
                {isInteractive && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetAutoType();
                    }}
                    className="bento-pill-btn"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      textDecoration: "underline",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      minHeight: "44px",
                      minWidth: "44px",
                      padding: "0 6px",
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
              <span>
                {wordCount} words, {readTimeMin} min read
              </span>
            </div>
          </div>
        ) : (
          <div
            id="panel-read"
            role="tabpanel"
            aria-labelledby="tab-read"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              position: "relative",
              zIndex: 2,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-code)",
                color: "var(--text-faint)",
              }}
            >
              Sample preview — Reader mode
            </div>

            <h4
              style={{
                fontFamily: "var(--font-editorial)",
                fontSize: "1.25rem",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Inverted Fullbacks &amp; The Modern Press
            </h4>

            <div
              style={{
                fontFamily: "var(--font-editorial)",
                fontSize: "1rem",
                lineHeight: 1.7,
                color: "var(--text-primary)",
                maxWidth: "65ch",
              }}
            >
              {activeContent || AUTO_TEXT}
            </div>

            <div
              style={{
                marginTop: "auto",
                paddingTop: "0.75rem",
                borderTop: "1px solid var(--border-hairline)",
                fontSize: "0.75rem",
                fontFamily: "var(--font-code)",
                color: "var(--text-faint)",
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <span>Newsreader serif, 65ch width</span>
              <span>Quiet reading view</span>
            </div>
          </div>
        )}
      </div>

      {/* Compact Bottom-Right Floating Status Pill */}
      <div
        className="hero-float-card hero-float-card-2"
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "0.125rem",
          top: "auto",
          right: "0",
          left: "auto",
          display: "inline-flex",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: "0.45rem",
          width: "fit-content",
          height: "fit-content",
          maxHeight: "40px",
          maxWidth: "100%",
          whiteSpace: "nowrap",
          background: "var(--bg-surface2)",
          border: "1px solid var(--border-hairline)",
          borderRadius: "9999px",
          padding: "0.375rem 0.875rem",
          boxShadow: "inset 0 1px 0 0 var(--rim-specular), var(--shadow-card)",
          fontSize: "0.75rem",
          zIndex: 10,
        }}
      >
        <span className="status-dot status-dot-live" />
        <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>Published at</span>
        <span
          style={{
            color: "var(--text-primary)",
            fontWeight: 500,
            fontFamily: "var(--font-code)",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          @sample
        </span>
      </div>
    </div>
  );
}
