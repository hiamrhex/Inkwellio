import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

interface MagneticButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

/**
 * Pure server component primary pill link with <= 5px magnetic pull driven by
 * the single shared pointer listener in /scripts/landing-runtime.js and 100ms :active press feedback.
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
      {children}
    </Link>
  );
}
