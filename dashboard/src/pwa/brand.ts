// Single source of truth for the PWA/TWA brand color, shared between
// vite.config.ts (manifest theme/background color) and pwa-assets.config.ts
// (icon padding fill). Keep this in sync with --color-bg in
// src/styles/tokens.css by hand — a plain .ts/.svg/.html file can't read a
// CSS custom property at build time, so this is the closest we have to one
// source of truth for the non-CSS consumers.
export const BRAND_BG = '#0f1117'
