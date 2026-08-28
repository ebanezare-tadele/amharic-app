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
      // The default auto-injected registration script only calls
      // navigator.serviceWorker.register() — it never checks the new SW
      // in, and never reloads the page once one activates. src/main.jsx
      // does that itself via the virtual:pwa-register module instead, so
      // updates actually apply rather than sitting installed-but-unused
      // until some unrelated future reload.
      injectRegister: false,
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
        // registerType: 'autoUpdate' above only configures the CLIENT
        // register script (main.jsx's registerSW) to reload the page once
        // a new service worker activates. It does nothing to make that
        // service worker activate promptly — by default a new SW installs
        // and then just sits in "waiting" until every tab running the old
        // one closes, which on a phone PWA that's rarely backgrounded-to-
        // fully-quit can be days. skipWaiting + clientsClaim are what
        // actually make the new SW take over immediately once installed,
        // which is what triggers that reload in the first place. Without
        // these two, "auto update" was updating nothing automatically.
        skipWaiting: true,
        clientsClaim: true,
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
          {
            // manifest.json (public/audio/official/) lists which clips a
            // generation run actually verified — small and worth
            // rechecking on every visit rather than trusting a stale
            // cached copy forever, since it's what decides whether a
            // "hear it" button even offers this tier.
            urlPattern: ({ url }) => url.pathname.endsWith('/audio/official/manifest.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'official-audio-manifest', networkTimeoutSeconds: 3 },
          },
          {
            // The clips manifest.json points to (~a few MB, not worth
            // forcing into everyone's initial install) — deliberately
            // left out of globPatterns above; cached the first time each
            // one is actually played, then available offline from then on.
            //
            // cacheName is versioned (v2, not "official-audio") on
            // purpose: an earlier commit (b80b603, since reverted) baked
            // in a first batch of clips under these exact same filenames
            // that were prone to TTS hallucination, then a later commit
            // replaced them with better-verified clips at the same URLs.
            // CacheFirst never revalidates a URL it's already cached, so
            // any browser that played a letter/word during that window
            // would keep serving the old wrong audio forever, even after
            // the correct files were deployed — indistinguishable from
            // the bug never having been fixed. Renaming the cache is what
            // actually invalidates that: it's a fresh, empty cache, so
            // everyone refetches from the network at least once. Bump
            // this suffix again (v3, v4, ...) any time already-shipped
            // clips are regenerated/replaced under unchanged filenames.
            urlPattern: ({ url }) => url.pathname.includes('/audio/official/') && url.pathname.endsWith('.mp3'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'official-audio-v2',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
