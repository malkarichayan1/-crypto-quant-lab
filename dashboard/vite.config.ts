/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { BRAND_BG } from './src/pwa/brand'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration script is a no-op until 'load', so don't block parsing on it.
      injectRegister: 'script-defer',
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon-180x180.png',
        'pwa-icon.svg',
      ],
      manifest: {
        id: '/',
        name: 'HedgeFund Simulator',
        short_name: 'HedgeFund',
        description:
          'Trade crypto with $100,000 in virtual cash, real market prices, and free AI advice. No real money, ever.',
        // The installed app's entry point is the dashboard, not the marketing
        // landing page (which stays reachable via in-app navigation/links).
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        theme_color: BRAND_BG,
        background_color: BRAND_BG,
        categories: ['finance', 'education'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Without this, the SW's navigation fallback matches ANY same-origin
        // navigation, not just client-side app routes — so a direct visit to
        // /robots.txt, /sitemap.xml, or /.well-known/assetlinks.json would be
        // served the SPA shell instead of the real file once the SW is
        // active. Excluding anything with a file extension (plus .well-known
        // explicitly, since it has none) keeps the fallback scoped to actual
        // app routes only.
        navigateFallbackDenylist: [/^\/\.well-known\//, /\.[^/]+$/],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/vitest.setup.ts',
  },
})
