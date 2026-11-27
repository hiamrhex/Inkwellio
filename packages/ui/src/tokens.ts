/**
 * Ink & Paper design tokens — Inkwellio (WP7 Phase 1C: 60 / 35 / 5 colour system).
 * Computed contrast values verified programmatically via WCAG 2.1 formula.
 *
 * Dark (Ink): 60% pure black (#000000), 35% elevated #08090c cards + #ffffff ink,
 *   5% whisper-light floaty emerald (#10b981) mist, glints, dots, and focus marks.
 * Light (Paper): 60% crisp bright white (#fafafa) canvas + pure #ffffff floating cards,
 *   35% #050608 primary ink + two-layer elevation shadows,
 *   5% subtle emerald (#0f766e / #059669) mist + glints.
 */

export const tokens = {
  dark: {
    bgCanvas:       '#000000',
    bgSurface1:     '#08090c',
    bgSurface2:     '#101218',
    bgSurface3:     '#171a22',
    textPrimary:    '#ffffff',
    textMuted:      '#b4b9c2',
    textFaint:      '#969ca8',
    borderHairline: 'rgba(255,255,255,0.10)',
    btnPrimaryBg:   '#ffffff',
    btnPrimaryText: '#000000',
    statusLive:     '#10b981',
    statusAmber:    '#ffd60a',
    accent:         '#10b981',
    accentText:     '#000000',
    accentPinch:    'rgba(16, 185, 129, 0.075)',
    washSpec: {
      silverRgb:       [226, 232, 240] as const,
      silverMaxAlpha:  0.08,
      emeraldRgb:      [16, 185, 129] as const,
      emeraldMaxAlpha: 0.08,
    },
  },
  light: {
    bgCanvas:       '#fafafa',
    bgSurface1:     '#ffffff',
    bgSurface2:     '#ffffff',
    bgSurface3:     '#f1f4f7',
    textPrimary:    '#050608',
    textMuted:      '#3f4451',
    textFaint:      '#505663',
    borderHairline: 'rgba(9,11,16,0.12)',
    btnPrimaryBg:   '#050608',
    btnPrimaryText: '#ffffff',
    statusLive:     '#0f766e',
    statusAmber:    '#b45309',
    accent:         '#0f766e',
    accentText:     '#ffffff',
    accentPinch:    'rgba(5, 150, 105, 0.065)',
    washSpec: {
      silverRgb:       [148, 163, 184] as const,
      silverMaxAlpha:  0.07,
      emeraldRgb:      [5, 150, 105] as const,
      emeraldMaxAlpha: 0.07,
    },
  },
} as const;

export type ColorMode = keyof typeof tokens;
export type TokenKey = keyof typeof tokens.dark;

export const UI_PACKAGE_NAME = '@inkwellio/ui' as const;
