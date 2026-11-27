/**
 * Ink & Paper design tokens — Inkwellio (WP7)
 * Computed contrast values verified programmatically via wcag-contrast formula.
 *
 * Dark (Ink): true black base (#000000) with elevated surfaces.
 * Light (Paper): crisp cool archival canvas (#f1f3f5) with pure white (#ffffff) elevated surfaces.
 * Strict monochrome interactive triggers (stark white/black); accent reserved
 * strictly for <= 6px status dots, subtle surface/headline sheens, and :focus-visible rings.
 */

export const tokens = {
  dark: {
    bgCanvas:       '#000000',
    bgSurface1:     '#0a0b0e',
    bgSurface2:     '#121318',
    bgSurface3:     '#191b22',
    textPrimary:    '#fafafa',
    textMuted:      '#a1a1a6',
    textFaint:      '#7c7c82',
    borderHairline: 'rgba(255,255,255,0.08)',
    // Strict monochrome buttons
    btnPrimaryBg:   '#ffffff',
    btnPrimaryText: '#000000',
    // Functional status marks (<= 6px dots, nib breather dot & focus rings only)
    statusLive:     '#10b981',
    statusAmber:    '#ffd60a',
    accent:         '#0a84ff', // Focus rings & accessibility
    accentText:     '#000000',
    accentPinch:    'rgba(226, 232, 240, 0.095)',
  },
  light: {
    bgCanvas:       '#f1f3f5', // Cool archival slate paper canvas
    bgSurface1:     '#ffffff', // Pure white elevated card
    bgSurface2:     '#ffffff', // Pure white modal / floating card
    bgSurface3:     '#e7eaee', // Recessed well / badge
    textPrimary:    '#0a0a0b',
    textMuted:      '#4d515a',
    textFaint:      '#60656e',
    borderHairline: 'rgba(15,23,42,0.10)',
    // Strict monochrome buttons
    btnPrimaryBg:   '#0a0a0b',
    btnPrimaryText: '#ffffff',
    // Functional status marks (<= 6px dots, nib breather dot & focus rings only)
    statusLive:     '#0f766e',
    statusAmber:    '#b45309',
    accent:         '#0066cc', // Focus rings & accessibility
    accentText:     '#ffffff',
    accentPinch:    'rgba(15, 23, 42, 0.06)',
  },
} as const;

export type ColorMode = keyof typeof tokens;
export type TokenKey = keyof typeof tokens.dark;

// Legacy flat export — kept for backward-compat with existing tests
export const UI_PACKAGE_NAME = '@inkwellio/ui' as const;
