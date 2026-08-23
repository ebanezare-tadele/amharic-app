# ፊደል — Amharic Fidel

A self-contained React app for learning the Amharic script (fidel): all 34
consonant families across 7 vowel orders, vocabulary, phrases, a spaced-repetition
review queue, a word builder, a speed round, a letter-tracing pad, and a reader.

Originally built as a Claude.ai artifact (a single component running in a
sandboxed environment with its own `window.storage` API). This is that same
component — logic, curriculum, and copy unchanged apart from one now-inaccurate
privacy sentence (see below) — running as an installable Vite + React PWA.

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

The app runs fully without any setup below — shared recordings just fall
back to this browser's own storage until Supabase is configured (see next
section).

## Persistence

Two different scopes, two different backends:

- **Personal progress** (`xp`, `cards`, streaks, "Just me" recordings) —
  `localStorage`, via `src/lib/windowStorage.js`, a polyfill for the
  artifact sandbox's `window.storage.get/set/delete` API. Single-device is
  the right place for this; no change needed if you don't want one.

- **Shared "Everyone" recordings** — a family member's voice, meant to sync
  to every device everyone in the family uses. `localStorage` can't do
  that (it's per-browser), so this is backed by **Supabase**: a Postgres
  table (`shared_recordings`) for the index, a Storage bucket
  (`recordings`) for the audio blobs, and an Edge Function
  (`supabase/functions/shared-audio`) that gates every write behind a
  family passcode. Reads are public — anyone with the app URL can listen —
  but writing (recording, re-recording, deleting) requires the passcode,
  which is checked server-side, not just in the UI. That's what stops a
  stranger who finds the deployed URL from overwriting or spamming the
  shared recordings.

  **Why Supabase and not something else:** it's free at this scale, needs
  no server to run or pay for, and Postgres + Storage + Edge Functions
  cover exactly the three things this feature needs (an index, blob
  storage, and one gated write path) without inventing a bespoke backend.
  The alternative worth naming is a tiny always-on server you host
  yourself (e.g. a Fly.io/Render box with an Express app) — more control,
  but more to run and pay for, for a feature this small.

  If `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` aren't set, shared
  scope silently falls back to a separate `localStorage` namespace (with a
  console warning) so the app stays fully usable locally before you've
  set any of this up — "Everyone" recordings just won't actually leave
  the browser yet.

### Setting up Supabase (needed for shared recordings to actually sync)

1. Create a free project at [supabase.com](https://supabase.com).
2. Run `supabase/migrations/0001_shared_recordings.sql` against it — paste
   it into the SQL Editor in the dashboard, or if you have the
   [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link`
   then `supabase db push`.
3. Deploy the Edge Function:
   ```bash
   supabase functions deploy shared-audio
   ```
4. Set the family passcode (pick your own — this repo never contains a
   real one):
   ```bash
   supabase secrets set FAMILY_PASSCODE='choose-something-your-family-will-remember'
   ```
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already available
   to Edge Functions automatically — nothing to set for those.)
5. From **Project Settings → API**, copy the Project URL and the `anon`
   public key into a `.env.local` file (gitignored) for local dev, and
   into your hosting provider's environment variables for the deployed
   site:
   ```bash
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
6. Restart `npm run dev` (or redeploy). The first time anyone records to
   "Everyone", the app will ask for the family passcode and remember it
   in that browser afterward.

**Security note:** the passcode is cached in plaintext in `localStorage`
after the server verifies it once. That's deliberate, not an oversight —
see the comment in `src/lib/familyPasscode.js`. It's a family-scale
deterrent against a stranger with just the URL, not a substitute for real
auth; don't put anything more sensitive than short voice clips behind it.

Also worth knowing: audio clips are capped at ~700KB client-side (~1MB
enforced again server-side in the Edge Function) — fine for a one-second
pronunciation clip, but keep that in mind if you ever want longer audio.

## Installing as an app (PWA)

The app is installable on both Android and iOS, but the two platforms
trigger it differently:

- **Android (Chrome):** open the deployed URL. Chrome shows its own
  install affordance (an icon in the address bar, or "Install app" in the
  ⋮ menu) once it's decided the page qualifies — a valid manifest, icons,
  and an active service worker, all of which are already in place here.
  This can take a visit or two for Chrome's own engagement heuristics to
  kick in; it's not something the app can force.

- **iOS (Safari only):** open the URL in **Safari specifically** — Chrome,
  Firefox, etc. on iOS are all still WebKit under the hood, but Apple only
  exposes "Add to Home Screen" through Safari's own UI. Tap the Share icon
  → **Add to Home Screen** → Add. There's no automatic prompt on iOS the
  way there is on Android; it's always this manual step. Worth mentioning
  to family when you send the link.

Both platforms then get a standalone app (no browser chrome), the ፊ icon,
and offline access after the first load, via the service worker generated
by `vite-plugin-pwa` (`src/../vite.config.js`).

**What I verified vs. what needs your own phone:** I confirmed the
manifest is valid (name, icons at 192/512 including maskable variants,
`display: standalone`) and that the service worker registers and goes
active, using a headless browser. I could not verify the actual "tap Add
to Home Screen and see it appear" flow on a real iPhone or Android
device — this sandbox doesn't have one. Worth a real spot-check once
deployed, on both platforms, before you send the link around.

### Regenerating the icons

`public/icons/*.png` are generated, not hand-drawn — `scripts/gen-icons.mjs`
renders the app's own ፊ mark (rubric-red on ink-black, the same colors as
the in-app top bar) via headless Chromium, centered by measuring the
glyph's actual ink bounding box rather than trusting the font's em-box
(which doesn't center it). Re-run after changing the mark or palette:

```bash
node scripts/gen-icons.mjs
```

## Deploying

Zero-config on [Vercel](https://vercel.com): the app is a static Vite
build with no server-side code of its own (the only backend piece, the
Edge Function, lives and deploys separately in Supabase).

1. Push this repo to GitHub (already done if you're reading this from the
   repo).
2. On vercel.com → **Add New → Project**, import the repo. Vercel
   auto-detects the Vite framework preset (build command `vite build`,
   output directory `dist`) — nothing to change.
3. Add the two environment variables from the Supabase setup above
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) under
   **Settings → Environment Variables**, then redeploy so the build picks
   them up.
4. Deploy. You'll get a `*.vercel.app` URL — that's what you text people.
   A custom domain can be added later under **Settings → Domains**.

`vercel.json` in this repo just sets `Cache-Control: no-cache` on `sw.js`
and `manifest.webmanifest` so browsers always re-check them for updates
instead of caching a stale service worker.

Netlify works too and is nearly identical (drag-and-drop or GitHub import,
same build command/output dir, same env vars) — Vercel's just the
slightly smoother zero-config path for a plain Vite app.

## The one copy change

Everything in `src/App.jsx` is unchanged from the original artifact except
one paragraph in the Chart screen's privacy note, which claimed "no audio
or progress ever leaves this storage" — true when everything was
`localStorage`, false now that shared recordings sync to Supabase. It's
been reworded to describe what actually happens (personal data stays
local, shared recordings sync and are passcode-gated). Worth reading over
in case you'd rather word it differently — it's the only place I touched
copy on my own judgment rather than at your instruction.

## Structure

- `src/App.jsx` — the entire app (curriculum/lesson logic untouched; the
  Voice component gained a passcode prompt and the privacy note above).
- `src/lib/windowStorage.js` — `window.storage` polyfill; routes personal
  scope to `localStorage` and shared scope to Supabase (or a local
  fallback if unconfigured).
- `src/lib/supabaseClient.js` — Supabase client, `null` if unconfigured.
- `src/lib/sharedAudioStore.js` — shared-scope get/set/delete, translated
  into Supabase table reads and passcode-gated Edge Function writes.
- `src/lib/familyPasscode.js` — passcode caching + server-side verification.
- `supabase/migrations/0001_shared_recordings.sql` — table + RLS + bucket.
- `supabase/functions/shared-audio/index.ts` — the passcode-gated writer.
- `scripts/gen-icons.mjs` + `scripts/icon-template.html` — icon generator.
- `vite.config.js` — PWA plugin config (manifest contents, service worker
  caching strategy, including runtime caching for the Google Fonts the
  app's own injected CSS loads).
