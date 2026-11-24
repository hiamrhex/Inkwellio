/**
 * Ink & Paper design tokens — Inkwellio (WP7)
 * Computed contrast values verified programmatically via wcag-contrast formula.
 *
 * Dark (Ink): true black base (#000000) with elevated surfaces.
 * Light (Paper): archival off-white base (#fafafa) with pure white (#ffffff) elevated surfaces.
 * Strict monochrome interactive triggers (stark white/black); accent reserved
 * strictly for <= 6px functional status dots and :focus-visible rings.
 */

export const tokens = {
  dark: {
    bgCanvas:       '#000000',
    bgSurface1:     '#0c0c0d',
    bgSurface2:     '#141416',
    bgSurface3:     '#1c1c1f',
    textPrimary:    '#fafafa',
    textMuted:      '#a1a1a6',
    textFaint:      '#7c7c82',
    borderHairline: 'rgba(255,255,255,0.08)',
    // Strict monochrome buttons
    btnPrimaryBg:   '#ffffff',
    btnPrimaryText: '#000000',
    // Functional status marks (<= 6px dots & focus ring only)
    statusLive:     '#30d158',
    statusAmber:    '#ffd60a',
    accent:         '#0a84ff', // Focus rings & accessibility
    accentText:     '#000000',
  },
  light: {
    bgCanvas:       '#fafafa', // Archival off-white paper canvas
    bgSurface1:     '#ffffff', // Pure white elevated card
    bgSurface2:     '#ffffff', // Pure white modal / floating card
    bgSurface3:     '#f4f4f6', // Recessed well / badge
    textPrimary:    '#0a0a0b',
    textMuted:      '#55555a',
    textFaint:      '#707075',
    borderHairline: 'rgba(0,0,0,0.08)',
    // Strict monochrome buttons
    btnPrimaryBg:   '#0a0a0b',
    btnPrimaryText: '#ffffff',
    // Functional status marks (<= 6px dots & focus ring only)
    statusLive:     '#1a7f37',
    statusAmber:    '#b45309',
    accent:         '#0066cc', // Focus rings & accessibility
    accentText:     '#ffffff',
  },
} as const;

export type ColorMode = keyof typeof tokens;
export type TokenKey = keyof typeof tokens.dark;

// Legacy flat export — kept for backward-compat with existing tests
export const UI_PACKAGE_NAME = '@inkwellio/ui' as const;
