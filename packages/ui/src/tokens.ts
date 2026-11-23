/**
 * Ink & Paper design tokens — Inkwellio (WP7)
 * Computed contrast values verified programmatically via wcag-contrast formula.
 * Dark (Ink): true black base. Light (Paper): pure white base.
 */

export const tokens = {
  dark: {
    bgCanvas:    '#000000',
    bgSurface1:  '#0c0c0d',
    bgSurface2:  '#141415',
    bgSurface3:  '#1c1c1e',
    textPrimary: '#fafafa',
    textMuted:   '#a1a1a6',
    textFaint:   '#7c7c82',
    accent:      '#0a84ff',
    accentText:  '#000000',
    borderHairline: 'rgba(255,255,255,0.10)',
    // Accent swatches for Richard to pick
    accentIndigo: '#8b9bff',
    accentGreen:  '#30d158',
  },
  light: {
    bgCanvas:    '#ffffff',
    bgSurface1:  '#f5f5f7',
    bgSurface2:  '#ececef',
    bgSurface3:  '#e3e3e7',
    textPrimary: '#0a0a0b',
    textMuted:   '#55555a',
    textFaint:   '#707075',
    accent:      '#0066cc',
    accentText:  '#ffffff',
    borderHairline: 'rgba(0,0,0,0.08)',
    accentIndigo: '#4d53d9',
    accentGreen:  '#1a7f37',
  },
} as const;

export type ColorMode = keyof typeof tokens;
export type TokenKey = keyof typeof tokens.dark;

// Legacy flat export — kept for backward-compat with any existing tests
export const UI_PACKAGE_NAME = '@inkwellio/ui' as const;
