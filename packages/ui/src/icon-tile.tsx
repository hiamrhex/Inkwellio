import type { ReactNode } from "react";

interface IconTileProps {
  children?: ReactNode;
  size?: number;
  /** bg colour token or CSS value */
  bg?: string;
  className?: string;
}

/**
 * SquircleClipDef — SVG defs block defining the squircle clipPath.
 * Render once at the top of the page tree.
 */
export function SquircleClipDef() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        <clipPath id="inkwellio-squircle-clip" clipPathUnits="objectBoundingBox">
          {/* Superellipse n≈5 approximation using cubic Bézier */}
          <path d="M0.5,0 C0.81,0 1,0.19 1,0.5 C1,0.81 0.81,1 0.5,1 C0.19,1 0,0.81 0,0.5 C0,0.19 0.19,0 0.5,0 Z" />
        </clipPath>
      </defs>
    </svg>
  );
}

/**
 * IconTile — squircle container for an icon or glyph.
 */
export function IconTile({ children, size = 48, bg, className = "" }: IconTileProps) {
  return (
    <span
      className={`icon-tile ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        background: bg ?? "var(--bg-surface2)",
        clipPath: "url(#inkwellio-squircle-clip)",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}
