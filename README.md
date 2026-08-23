# ፊደል — Amharic Fidel

A self-contained React app for learning the Amharic script (fidel): all 34
consonant families across 7 vowel orders, vocabulary, phrases, a spaced-repetition
review queue, a word builder, a speed round, a letter-tracing pad, and a reader.

Originally built as a Claude.ai artifact (a single component running in a
sandboxed environment with its own `window.storage` API). This is that same
component — logic, curriculum, and copy unchanged — running as an ordinary
Vite + React app.

## Running it locally

```bash
npm install
npm run dev
```

Then open the printed `http://localhost:5173` URL.

```bash
npm run build    # production build to dist/
npm run preview  # serve that build locally
```

## Persistence

The artifact sandbox's `window.storage.get/set/delete` API (with a
`shared` flag for per-user vs. shared data) doesn't exist outside Claude.ai.
`src/lib/windowStorage.js` polyfills it with `localStorage`, namespaced under
`amharic-fidel:personal:*` and `amharic-fidel:shared:*`, so the app component
itself didn't need to change.

**This is a stopgap, not a real fix for the "Everyone" shared-recordings
feature.** In the app, `shared: true` was meant to mean "visible to every
family member using this app." With a `localStorage` backend it actually
means "visible in this one browser, on this one device" — it doesn't sync
across people or devices at all. If the shared-recordings feature is going to
work the way the UI implies, that needs a real backend (even something
lightweight like Supabase) to hold shared state, plus a way to identify who's
recording. Personal progress (`xp`, `cards`, streaks, etc.) is fine staying
local per-device for now.

Also worth knowing: recorded audio clips are stored as base64 data URLs.
`localStorage` typically caps out around 5–10MB per origin, so a family
recording all 34+ letters could bump into that ceiling well before hitting
the app's own 700KB-per-clip limit.

## Structure

- `src/App.jsx` — the entire app (untouched from the original artifact).
- `src/lib/windowStorage.js` — the `localStorage` polyfill for `window.storage`.
- `src/main.jsx` — entry point; imports the polyfill before mounting `App`.
