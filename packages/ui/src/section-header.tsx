import type { ReactNode } from "react";
import { Chip } from "./chip";

interface SectionHeaderProps {
  eyebrow?: string;
  heading: ReactNode;
  body?: ReactNode;
  align?: "left" | "center";
}

/**
 * SectionHeader — eyebrow chip + H2 + optional body paragraph.
 */
export function SectionHeader({
  eyebrow,
  heading,
  body,
  align = "center",
}: SectionHeaderProps) {
  const alignClass = align === "left" ? "text-left" : "text-center";
  const isCenter = align === "center";
  return (
    <header
      className={`section-header ${alignClass}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isCenter ? "center" : "flex-start",
        gap: "0.75rem",
      }}
    >
      {eyebrow && <Chip>{eyebrow}</Chip>}
      <h2
        style={{
          fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
          fontWeight: 600,
          letterSpacing: "-0.03em",
          lineHeight: 1.15,
          color: "var(--text-primary)",
          margin: 0,
        }}
      >
        {heading}
      </h2>
      {body && (
        <p
          style={{
            fontSize: "1.0625rem",
            lineHeight: 1.65,
            color: "var(--text-muted)",
            marginTop: 0,
            marginBottom: 0,
            marginInline: isCenter ? "auto" : undefined,
            textAlign: align,
            maxWidth: "52ch",
          }}
        >
          {body}
        </p>
      )}
    </header>
  );
}
