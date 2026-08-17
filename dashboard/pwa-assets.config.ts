import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'
import { BRAND_BG } from './src/pwa/brand'

// The generator pads maskable/apple icons to a safe zone by default and
// fills that padding with white unless told otherwise — override it so the
// padding matches the icon's own background instead of showing a white ring.

// Generates the full PWA/TWA icon set (favicon, apple-touch-icon, maskable,
// and manifest icons) from a single source image. Run via `npm run generate-pwa-assets`
// whenever public/pwa-icon.svg changes.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: BRAND_BG, fit: 'contain' },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: BRAND_BG, fit: 'contain' },
    },
  },
  images: ['public/pwa-icon.svg'],
})
