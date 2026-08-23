# ፊደል — Amharic Fidel

A self-contained React app for learning the Amharic script (fidel): all 34
consonant families across 7 vowel orders, vocabulary, phrases, a spaced-repetition
review queue, a word builder, a speed round, a letter-tracing pad, and a reader.

Originally built as a Claude.ai artifact (a single component running in a
sandboxed environment with its own `window.storage` API). This is that same
component — logic, curriculum, and copy unchanged apart from one privacy
paragraph (see "The one copy change" below) — running as an installable
Vite + React PWA.

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

The app runs fully with zero setup below — nothing here requires an
account with anyone. Shared "Everyone" recordings currently stay local to
whichever browser records them (see next section for why, and how to
change that later if you want to).

## Persistence

Two different scopes, two different backends — and right now, deliberately,
both are local:

- **Personal progress** (`xp`, `cards`, streaks, "Just me" recordings) —
  `localStorage`, via `src/lib/windowStorage.js`, a polyfill for the
  artifact sandbox's `window.storage.get/set/delete` API. Single-device is
  the right place for this regardless; no further work needed.

- **Shared "Everyone" recordings** — meant to eventually sync a family
  member's voice to every device everyone uses. Making that real needs
  *some* backend (localStorage is per-browser, it fundamentally can't sync
  across devices), and — per your call — this app isn't wired to one yet.
  Right now "Everyone" behaves exactly like "Just me": it stays on
  whichever device recorded it. The app's own copy on the Chart screen
  says this plainly rather than implying it syncs when it doesn't.

  **The code for real sync already exists and is dormant, not deleted** —
  `src/lib/sharedAudioStore.js` talks to Supabase (Postgres table +
  Storage bucket + a passcode-gated Edge Function, so a stranger with just
  the URL can't overwrite or spam the shared recordings) whenever
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set. Leave them unset
  (as they are now) and everything silently falls back to local-only
  storage, which is what's deployed today. Turn shared sync on later by
  following the steps below — no code changes needed, just environment
  variables plus a Supabase project.

  **Why Supabase, if/when you want this:** free at this scale, no server
  to run yourself, and Postgres + Storage + Edge Functions cover exactly
  the three things this feature needs (an index, blob storage, a gated
  write path). The alternative worth naming is a tiny always-on server you
  host yourself — more control, but more to run and pay for, for a feature
  this small. This isn't the only option, just the one already wired up;
  say the word if you'd rather explore something else (Cloudflare
  Workers + KV/R2, Firebase, etc.) when you're ready for real sync.

### Setting up Supabase later (optional — not needed to run or deploy today)

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

**GitHub Pages** — no third-party account needed at all, since the repo's
already on GitHub. `.github/workflows/deploy.yml` builds the app and
publishes `dist/` on every push to this branch.

The only thing that has to happen through GitHub's web UI (no API for
this that I have access to, and it's a one-time setting, not something
worth automating anyway):

1. On GitHub: **Settings → Pages → Build and deployment → Source →
   GitHub Actions**. That's the whole manual step.
2. Push to this branch (or **Actions → Deploy to GitHub Pages → Run
   workflow** to trigger it without waiting for a push).
3. The workflow's summary (and the Pages settings page) will show the
   live URL: `https://ebanezare-tadele.github.io/amharic-app/`. That's
   what you text people.

No environment variables needed for this deploy — shared recordings stay
in local-fallback mode (see Persistence above) until you decide to wire up
Supabase, at which point you'd add `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` as **Repository → Settings → Secrets and
variables → Actions → Variables**, then reference them in the workflow's
build step.

Because the repo isn't named `<username>.github.io`, GitHub Pages serves
it from a subpath rather than the domain root — `vite.config.js` sets
`base: '/amharic-app/'` to match. If you ever rename the repo or move to a
custom domain, update `BASE` there to match.

**If you'd rather use Vercel or Netlify instead** (e.g. for a custom
domain without GitHub Pages' subpath, or serverless functions
colocated with the frontend): both are equally zero-config for a plain
Vite build (`vite build` → `dist`), just import the repo from their
dashboard. `vercel.json` in this repo already sets
`Cache-Control: no-cache` on `sw.js`/`manifest.webmanifest` for that path,
if you go that route later.

## The one copy change

Everything in `src/App.jsx` is unchanged from the original artifact except
one paragraph in the Chart screen's privacy note, which claimed "no audio
or progress ever leaves this storage." That's still true exactly as
deployed today (Supabase isn't configured, so nothing does leave the
device) — but the note now says so conditionally rather than
unconditionally, since the sentence would otherwise go stale the moment
someone configures Supabase without also remembering to update this copy.
Worth reading over in `src/App.jsx`'s `Chart` component in case you'd
rather word either branch differently — it's the only place I touched
copy on my own judgment rather than at your instruction.

## Structure

- `src/App.jsx` — the entire app (curriculum/lesson logic untouched; the
  Voice component gained a passcode prompt, and the privacy note above
  is now aware of whether Supabase is configured).
- `src/lib/windowStorage.js` — `window.storage` polyfill; routes personal
  scope to `localStorage` and shared scope to Supabase when configured,
  local fallback otherwise (the current deployed state).
- `src/lib/supabaseClient.js` — Supabase client, `null` if unconfigured.
- `src/lib/sharedAudioStore.js` — shared-scope get/set/delete, translated
  into Supabase table reads and passcode-gated Edge Function writes.
  Dormant until Supabase env vars are set.
- `src/lib/familyPasscode.js` — passcode caching + server-side verification.
- `supabase/migrations/0001_shared_recordings.sql` — table + RLS + bucket,
  for whenever you turn shared sync on.
- `supabase/functions/shared-audio/index.ts` — the passcode-gated writer.
- `scripts/gen-icons.mjs` + `scripts/icon-template.html` — icon generator.
- `.github/workflows/deploy.yml` — builds and publishes to GitHub Pages
  on every push to this branch.
- `vite.config.js` — `base` for the GitHub Pages subpath, PWA plugin
  config (manifest contents, service worker caching strategy, including
  runtime caching for the Google Fonts the app's own injected CSS loads).
