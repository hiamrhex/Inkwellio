import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

interface MagneticButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

/**
 * Pure server component primary pill link with smooth magnetic pull driven by
 * /scripts/landing-runtime.js, 2px label micro-parallax, and 100ms :active press feedback.
 */
export function MagneticButton({
  href,
  children,
  className = "",
  ...props
}: MagneticButtonProps) {
  return (
    <Link
      href={href}
      data-magnetic="true"
      className={`magnetic-btn ${className}`.trim()}
      {...props}
    >
      <span className="mag-label">{children}</span>
    </Link>
  );
}
