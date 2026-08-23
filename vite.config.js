import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves a project repo (not a *.github.io repo itself) from
// a subpath — https://<user>.github.io/amharic-app/ — so every asset URL
// needs that prefix. If you later move this to a custom domain or a
// user/org root site, change this back to '/'.
const BASE = '/amharic-app/'

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'ፊደል — Amharic Fidel',
        short_name: 'ፊደል',
        description: 'Learn the Amharic fidel — 34 consonant families across 7 vowel orders.',
        // Relative, not "/..." — vite-plugin-pwa resolves these against
        // `base` above, so they still work under the /amharic-app/ subpath.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#10162A',
        theme_color: '#10162A',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the build output so the app opens and works offline
        // after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            // Noto Serif Ethiopic / IBM Plex Sans / Instrument Serif, loaded
            // at runtime by App.jsx's own injected <style>. Cache them so
            // the fidel glyphs still render offline after first load.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
