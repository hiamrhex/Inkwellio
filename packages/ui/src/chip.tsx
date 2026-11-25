import type { ReactNode } from "react";

interface ChipProps {
  children?: ReactNode;
  className?: string;
}

/**
 * Chip — small pill label used for section eyebrows.
 * Styled via CSS variables from globals.css.
 */
export function Chip({ children, className = "" }: ChipProps) {
  return (
    <span
      className={`chip ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
        maxWidth: "100%",
        padding: "4px 12px",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 500,
        letterSpacing: "0.01em",
        border: "1px solid var(--border-hairline)",
        color: "var(--text-muted)",
        background: "var(--bg-surface1)",
      }}
    >
      {children}
    </span>
  );
}
