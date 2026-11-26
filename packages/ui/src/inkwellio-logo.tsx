interface InkwellioLogoProps {
  readonly size?: number;
  readonly className?: string;
}

/**
 * Shared Inkwellio nib emblem — concave-tapered fountain-pen nib with tip notch,
 * narrow vertical ink slit ending in the emerald breather dot, and crisp base.
 * Kept in a single file (< 0.6 KiB inline SVG) so the mark can be updated globally.
 */
export function InkwellioLogo({ size = 20, className = "" }: InkwellioLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className ? `inkwellio-logo ${className}` : "inkwellio-logo"}
    >
      <path
        d="M11.4 2C10 6.5 7 9.6 5 13.6L8 18.6H16L19 13.6C17 9.6 14 6.5 12.6 2L12.32 2.85V11.6H11.68V2.85L11.4 2ZM7.6 19.8H16.4V21.6H7.6Z"
        fill="var(--logo-body, #ffffff)"
      />
      <circle cx="12" cy="12.2" r="1.45" fill="var(--status-live, #10b981)" />
    </svg>
  );
}
