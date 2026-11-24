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
        padding: "2px 10px",
        borderRadius: "9999px",
        fontSize: "0.6875rem",
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        border: "1px solid var(--border-hairline)",
        color: "var(--text-muted)",
        background: "var(--bg-surface1)",
      }}
    >
      {children}
    </span>
  );
}
