"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSpring2D } from "@inkwellio/ui/client";

const AUTO_TEXT =
  "In the 64th minute, City inverted their right-back into the inside channel, instantly overloading the midfield pivot and forcing the defense into an uncomfortable choice.";

export function LivingHeroArtifact() {
  const [mode, setMode] = useState<"write" | "read">("write");
  const [typedText, setTypedText] = useState("");
  const [isInteractive, setIsInteractive] = useState(false);
  const [userText, setUserText] = useState(AUTO_TEXT);
  const [tiltTarget, setTiltTarget] = useState({ x: 0, y: 0 });

  // Spring physics for 3D card tilt & parallax (max ±6°)
  const springTilt = useSpring2D(tiltTarget, { stiffness: 120, damping: 18 });

  const cardRef = useRef<HTMLDivElement>(null);
  const charIndexRef = useRef(0);

  // Auto-typing cadence in Write Mode
  useEffect(() => {
    if (mode !== "write" || isInteractive) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    charIndexRef.current = 0;

    const intervalId = setInterval(() => {
      if (charIndexRef.current < AUTO_TEXT.length) {
        charIndexRef.current++;
        setTypedText(AUTO_TEXT.slice(0, charIndexRef.current));
      } else {
        clearInterval(intervalId);
      }
    }, 38);

    return () => {
      clearInterval(intervalId);
    };
  }, [mode, isInteractive]);

  // Handle pointer tracking for 3D tilt (clamped to max ±6°)
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const mx = (x / rect.width - 0.5) * 2;
    const my = (y / rect.height - 0.5) * 2;

    const targetTiltX = Math.max(-6, Math.min(6, -my * 6));
    const targetTiltY = Math.max(-6, Math.min(6, mx * 6));

    setTiltTarget({ x: targetTiltX, y: targetTiltY });
  }, []);

  const handlePointerLeave = useCallback(() => {
    setTiltTarget({ x: 0, y: 0 });
  }, []);

  const handleEditorClick = () => {
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
    if (newMode === "write") {
      charIndexRef.current = 0;
      setTypedText("");
    }
  };

  const isReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const displayedTypedText = isReduced ? AUTO_TEXT : typedText;
  const activeContent = isInteractive ? userText : displayedTypedText;
  const wordCount = activeContent.trim()
    ? activeContent.trim().split(/\s+/).length
    : 0;
  const readTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div
      ref={cardRef}
      className="hero-artifact-container"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "540px",
        paddingTop: "3.125rem",
        paddingBottom: "3.125rem",
        perspective: "1000px",
        margin: "0 auto",
      }}
    >
      {/* Subtle architectural hairline wireframe offset behind focal card */}
      <div
        className="hero-wireframe-frame"
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "2.5rem",
          bottom: "3.75rem",
          left: "0.75rem",
          right: "-0.5rem",
          borderRadius: "1.35rem",
          border: "1px solid var(--wireframe-hairline)",
          pointerEvents: "none",
          zIndex: 0,
          transform: `rotateX(${springTilt.x * 0.45}deg) rotateY(${springTilt.y * 0.45}deg)`,
          transition: "transform 0.12s linear",
        }}
      />

      {/* Compact Top-Left Floating Status Pill (positioned cleanly outside card toolbar) */}
      <div
        className="hero-float-card hero-float-card-1"
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "0.25rem",
          bottom: "auto",
          left: "0.25rem",
          right: "auto",
          display: "inline-flex",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: "0.5rem",
          width: "fit-content",
          height: "fit-content",
          maxHeight: "42px",
          maxWidth: "100%",
          whiteSpace: "nowrap",
          transform: `translate3d(${springTilt.y * -1.4}px, ${springTilt.x * 1.4}px, 35px)`,
          transition: "transform 0.1s linear",
          background: "var(--bg-surface2)",
          border: "1px solid var(--border-hairline)",
          borderRadius: "9999px",
          padding: "0.4375rem 0.875rem",
          boxShadow: "inset 0 1px 0 0 var(--rim-specular), var(--shadow-card)",
          fontSize: "0.75rem",
          zIndex: 10,
        }}
      >
        <span className="status-dot status-dot-amber" />
        <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>Draft saved</span>
        <span style={{ color: "var(--text-faint)" }}>&middot;</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500, fontFamily: "var(--font-geist-mono)" }}>
          2 min ago
        </span>
      </div>

      {/* 3D Tilted Living Card Body */}
      <div
        className="hero-form-body hero-living-card hero-scroll-card"
        style={{
          transform: `rotateX(${springTilt.x}deg) rotateY(${springTilt.y}deg) translateY(calc(var(--hero-scroll, 0) * -14px))`,
          transformStyle: "preserve-3d",
          position: "relative",
          zIndex: 2,
          borderRadius: "1.25rem",
          background:
            mode === "read"
              ? "color-mix(in srgb, var(--bg-surface1) 92%, var(--bg-surface2))"
              : "var(--bg-surface1)",
          border: "1px solid var(--border-hairline)",
          boxShadow: "inset 0 1px 0 0 var(--rim-specular), var(--shadow-card)",
          padding: "1.25rem 1.5rem",
          minHeight: "340px",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          transition: "background 0.25s ease, border-color 0.25s ease",
        }}
      >
        {/* Specular Highlight Layer */}
        <div
          className="hero-form-specular"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            pointerEvents: "none",
            background: `radial-gradient(400px circle at ${50 + springTilt.y * 3}% ${50 - springTilt.x * 3}%, var(--rim-specular), transparent 70%)`,
          }}
          aria-hidden="true"
        />

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
            gap: "0.75rem",
            paddingBottom: "0.75rem",
            borderBottom: "1px solid var(--border-hairline)",
            position: "relative",
            zIndex: 2,
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
                fontFamily: "var(--font-geist-mono)",
                color: "var(--text-muted)",
                marginLeft: "0.25rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Draft &middot; City away leg
            </span>
          </div>

          {/* Accessible Segmented Switcher */}
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
              style={{
                padding: "3px 12px",
                fontSize: "0.6875rem",
                fontWeight: 500,
                borderRadius: "9999px",
                border: "none",
                cursor: "pointer",
                background: mode === "write" ? "var(--btn-primary-bg)" : "transparent",
                color: mode === "write" ? "var(--btn-primary-text)" : "var(--text-muted)",
                transition: "background 0.15s ease, color 0.15s ease",
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
              style={{
                padding: "3px 12px",
                fontSize: "0.6875rem",
                fontWeight: 500,
                borderRadius: "9999px",
                border: "none",
                cursor: "pointer",
                background: mode === "read" ? "var(--btn-primary-bg)" : "transparent",
                color: mode === "read" ? "var(--btn-primary-text)" : "var(--text-muted)",
                transition: "background 0.15s ease, color 0.15s ease",
              }}
            >
              Read
            </button>
          </div>
        </div>

        {/* View Mode Panels */}
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
            }}
          >
            <span className="sr-only">
              Interactive football article editor preview demonstrating live drafting cadence, autosave, and word count.
            </span>

            {/* Click-to-pause & Interactive Typing Area */}
            <div
              onClick={handleEditorClick}
              style={{
                flex: 1,
                cursor: isInteractive ? "text" : "pointer",
                position: "relative",
                minHeight: "140px",
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
                    minHeight: "140px",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    resize: "none",
                    fontFamily: "var(--font-geist-sans)",
                    fontSize: "0.9375rem",
                    lineHeight: 1.65,
                    color: "var(--text-primary)",
                    padding: 0,
                  }}
                />
              ) : (
                <div
                  aria-hidden="true"
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

            {/* Live Interactive Status & Metadata Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                paddingTop: "0.75rem",
                borderTop: "1px solid var(--border-hairline)",
                fontSize: "0.6875rem",
                fontFamily: "var(--font-geist-mono)",
                color: "var(--text-faint)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="status-dot status-dot-amber" />
                <span>
                  {isInteractive ? "Interactive mode · Typing live" : "Auto-typing preview"}
                </span>
                {isInteractive && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetAutoType();
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      textDecoration: "underline",
                      cursor: "pointer",
                      fontSize: "0.6875rem",
                      padding: 0,
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
              <span>
                {wordCount} words &middot; {readTimeMin} min read
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
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-geist-mono)",
                color: "var(--text-faint)",
              }}
            >
              Sample preview &middot; Reader mode
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
                fontSize: "0.6875rem",
                fontFamily: "var(--font-geist-mono)",
                color: "var(--text-faint)",
                display: "flex",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <span>Newsreader Serif &middot; 65ch measure</span>
              <span>Clean reader ergonomics</span>
            </div>
          </div>
        )}
      </div>

      {/* Compact Bottom-Right Floating Status Pill (positioned cleanly outside card body) */}
      <div
        className="hero-float-card hero-float-card-2"
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "0.25rem",
          top: "auto",
          right: "0.25rem",
          left: "auto",
          display: "inline-flex",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: "0.5rem",
          width: "fit-content",
          height: "fit-content",
          maxHeight: "42px",
          maxWidth: "100%",
          whiteSpace: "nowrap",
          transform: `translate3d(${springTilt.y * -1.8}px, ${springTilt.x * 1.8}px, 45px)`,
          transition: "transform 0.1s linear",
          background: "var(--bg-surface2)",
          border: "1px solid var(--border-hairline)",
          borderRadius: "9999px",
          padding: "0.4375rem 0.875rem",
          boxShadow: "inset 0 1px 0 0 var(--rim-specular), var(--shadow-card)",
          fontSize: "0.75rem",
          zIndex: 10,
        }}
      >
        <span className="status-dot status-dot-live" />
        <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>Published</span>
        <span style={{ color: "var(--text-faint)" }}>&middot;</span>
        <span
          style={{
            color: "var(--text-primary)",
            fontWeight: 500,
            fontFamily: "var(--font-geist-mono)",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          inkwellio.example/@sample
        </span>
      </div>
    </div>
  );
}
