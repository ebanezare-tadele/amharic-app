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

### The link preview card

When the URL is shared (texted, dropped in WhatsApp/Slack/iMessage), it
shows a preview card instead of a bare link — `public/og-image.png`
(generated by `scripts/gen-og-image.mjs`, same technique as the icons)
plus the Open Graph/Twitter Card meta tags in `index.html`. Those tags
hardcode the deployed URL (`og:url`, `og:image`) since the spec requires
absolute URLs — update them if the app ever moves off
`ebanezare-tadele.github.io/amharic-app/`. Regenerate the image after
changing its template:

```bash
node scripts/gen-og-image.mjs
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

## Ideas that would need a platform (parked, not built)

Everything shipped so far runs on GitHub alone — no other account, no
cost. These would each genuinely need something more, so they're written
down here rather than half-built. None of this is planned; it's a list to
revisit if/when one of them actually matters to you.

**Standing constraint for all of these:** whatever gets picked has to be
free or as close to it as possible. That's a real design constraint, not
a nice-to-have — it rules out anything with an unavoidable per-use cost
(most cloud TTS APIs) or steers toward the free tier of a paid platform
(Supabase, Cloudflare) rather than a plan that costs money from day one.
Flagged per item below.

- **Real cross-device shared recordings** — the one already scoped and
  coded, just dormant. Needs a Supabase project. *Cost: free* — everything
  this feature uses (Postgres, Storage, one Edge Function) fits inside
  Supabase's free tier at family scale (34-ish short audio clips, low
  request volume). See "Persistence" above.
- **Cross-device personal progress** — right now `xp`/streak/mastery live
  in one device's `localStorage`; using the app on a second device starts
  fresh. Syncing that needs real accounts (some auth, not just a
  passcode) plus a database — a meaningfully bigger lift than the
  passcode-gated shared recordings, since it means identifying individual
  people, not just gating one shared write path. *Cost: likely free* —
  same Supabase project (it includes auth), still free tier at this
  scale.
- **Push notifications** (e.g. "come back for today's lesson") — Web Push
  needs a server to hold subscriptions and trigger sends. *Cost: free* —
  a Supabase Edge Function on a cron trigger (or Cloudflare's free
  Workers + Cron Triggers) covers this at zero cost for family-scale
  usage; no separate push-notification SaaS needed.
- **A custom domain** — not a new *platform* exactly, but a domain
  registrar account and DNS changes, if `github.io` ever feels wrong for
  texting to people. *Cost: not free* — domain registration is roughly
  $10-15/year regardless of registrar; there's no genuinely free version
  of "your own domain name." Skippable — the `github.io` URL costs
  nothing and already works.

Worth naming the one tension up front, cost aside: several of these
(accounts, push) cut against the "no analytics, nothing sent anywhere
else" story the app currently tells about personal data (see below). Not a
blocker, just something to weigh deliberately per feature rather than let
creep in.

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

## Onboarding: the first-launch tour

New, not part of the original artifact — a five-step walkthrough (`Tour`
in `src/App.jsx`) shown once, before Home, on first launch: what the app
is, then one step per tab (Learn, Chart, Read & Write), ending on "Start
learning." Skippable at any step. Tracked in `state.seenIntro`, a field
the original artifact already had but never used — so this needed no new
persistence plumbing, just a use for a field that was already there.

Alongside it, a few small in-place tips (`Callout`) point out things that
aren't otherwise explained where they'd actually matter: what "level" and
the streak actually track (Home), and what recording to "Everyone" means
before you do it (Chart). Each shows once, dismissible, same
`seenIntro` tracking.

Neither touches the app's curriculum or lesson logic — this is
onboarding for the app itself, layered on top.

## Script history and badges

Also new, also layered on top rather than editing what was there:

- **"Where this comes from"** (Chart tab, after the numerals/punctuation
  reference material) — a short, researched history of the Ge'ez script:
  its descent from the Ancient South Arabian abjad, the 4th-century shift
  to an abugida (vowel-marking system) tied to King Ezana's Aksum stele,
  where the word "abugida" itself comes from, and Amharic's 13th-century
  split from Ge'ez. Every claim here was checked against multiple sources
  before going in — historical content read by learners as fact doesn't
  get to be a guess. The five "silent twin" letters' notes (`FAMS` in
  `src/App.jsx`) got the same treatment: each now says what sound Ge'ez
  actually distinguished before Amharic merged it away, not just that a
  merger happened.
- **Badges** (`Badges` component, bottom of Home) — eight milestones
  (first letter, all 34 bases, the full 238-cell fidel, level 5, ten
  letters at full mastery, a week streak, a speed-round score, a first
  family recording), each computed live from state that already existed
  — nothing new to persist, nothing that can drift out of sync with the
  data it's based on. Tap one to see what it takes.

Sourcing for the history content, if you want to check it yourself or
extend it:

- [Ge'ez script — Wikipedia](https://en.wikipedia.org/wiki/Ge%CA%BDez_script)
- [Ezana of Axum — Wikipedia](https://en.wikipedia.org/wiki/Ezana_of_Axum)
- [Abugida — Wikipedia](https://en.wikipedia.org/wiki/Abugida)
- [Ge'ez (Ethiopic) script — Omniglot](https://www.omniglot.com/writing/ethiopic.htm)
- [The Amharic Alphabet — EveryAlphabet](https://www.everyalphabet.com/amharic)

## Hearing pronunciation — real audio for every letter, word, and phrase

Every "► hear it" button in the app — letters, the 34 anchor words, the 14
phrases, and the post-answer drill review — now plays a real Amharic voice
by default, on every device, with no setup and no per-use cost. This
replaced an earlier two-tier system (device text-to-speech, then a family
recording) that turned out to have a real hole in it: most phones don't
ship an Amharic voice at all (iOS Safari never does), so on a fresh
install where nobody had recorded anything yet, every audio control in
the app was either silently absent or explicitly said "no recording yet."
That was accurate, but it meant the feature didn't actually work out of
the box for the person it mattered most for — someone with no family
recording session behind them yet.

**How it's real now:** every clip — 238 letters (34 families × 7 vowel
orders) + 34 anchor words + 14 phrases, 286 total — was generated once
through [Addis AI](https://www.addisassistant.com/)'s Voice 2 API (the
`am-hamen` voice) and is baked into the app as static files under
`public/audio/official/`, addressed by the same `(fam, order)` scheme the
recording system already used (`letter-{fam}-{order}.mp3`,
`anchor-{i}.mp3`, `phrase-{i}.mp3` — see `officialAudioUrl()` in
`src/App.jsx`). Nothing calls Addis AI at runtime; the API key never
ships to the browser, and there's no per-use cost, because the "use" was
a one-time generation, not something that happens every time someone taps
a button.

The priority every "hear it" button (`HearButton` in `src/App.jsx`) now
follows: **your own recording → the family's shared recording → the
baked-in official clip → the device's own Amharic voice**, in that order,
falling through only if a step genuinely isn't there. In practice the
official clip covers everything, so a device voice is only ever needed as
a defensive last resort. Recording your own voice (`Voice`, unchanged) is
still there and still takes priority — it's just optional now, for
learning from someone you actually know rather than a requirement to get
any audio at all.

**Regenerating the clips**, if the letter/word/phrase content ever
changes: `.github/workflows/generate-audio.yml` is a manually-triggered
GitHub Actions workflow (**Actions → Generate official audio (one-time) →
Run workflow**) that runs `scripts/generate-official-audio.mjs` on
GitHub's own runners — no local Node install needed — and uploads the
result as a downloadable build artifact. It needs an `ADDIS_API_KEY` repo
secret (**Settings → Secrets and variables → Actions**); the key is never
committed or embedded anywhere in the repo. One real gotcha worth knowing
if you ever touch this script: Addis AI's API allows only **one voice
generation in flight per account at a time** — a 429
`CONCURRENT_GENERATION_LIMIT`/`RATE_LIMITED` response otherwise — so the
script deliberately runs strictly sequential requests with pacing and
real backoff on 429s, not concurrent ones. That's slow (all 286 clips
takes ~45 minutes) but it's a one-time run, so that trade is fine.

**Not precached, cached on first play instead:** `public/audio/official/`
is about 7MB total, which is too much to force into everyone's initial
install. `vite.config.js`'s `globPatterns` (the PWA's install-time
precache) deliberately excludes `.mp3`; a separate `runtimeCaching` rule
(`CacheFirst`, same pattern already used for Google Fonts) caches each
clip the first time it's actually played, so it's available offline from
then on without bloating the first visit.

Scoped to anchor words and phrases, not the larger sentence bank on the
Read tab — that's a lot more content to generate and it wasn't part of
what was asked for.

## Updates apply automatically — no re-saving to the home screen

`vite-plugin-pwa`'s default registration script only calls
`navigator.serviceWorker.register()` — it never checks whether a new
version actually took over, and never reloads the page if one does. On
its own, a new deploy would sit installed-but-unused in the background
indefinitely; the page you're looking at keeps running the code it
already loaded until something else triggers a reload.

`src/main.jsx` now registers through `virtual:pwa-register` instead
(`injectRegister: false` in `vite.config.js` turns off the default
script so there's only one registration, not two). With
`registerType: 'autoUpdate'`, that client reloads the page itself the
moment a new service worker actually activates — silently, no "update
available" prompt to tap through.

The other half: a browser only checks a service worker's own script for
byte-level changes roughly once every 24 hours by default, which is
slower than "opens this a few times a week." `main.jsx` forces that
check on every foreground — tab focus or the app coming back from the
background — so a change is picked up the next time it's actually
opened, not whenever the browser's own clock gets around to it.

Net effect: push a change, and the next time the installed app is
opened, it's current.

That was the intent from the start, but the first version of this had a
real gap: `registerType: 'autoUpdate'` only configures the *client*
register script above to reload once a new service worker activates —
it does nothing to make that service worker actually activate. Without
`skipWaiting`/`clientsClaim` set in the `workbox` block of
`vite.config.js`, a newly installed service worker just sits in
"waiting" state until every open tab running the *old* one fully
closes — which on a phone PWA that gets backgrounded rather than force-
quit can be days, or never. So the reload logic above was correct but
was never actually triggering for anyone who already had the app open.
`skipWaiting: true` + `clientsClaim: true` make the new service worker
take over immediately once it finishes installing, which is what fires
the "activated" event the reload logic listens for.

Verified end-to-end: built for production, served it, and confirmed
both that `self.skipWaiting()` / `clientsClaim()` are present
unconditionally in the generated `sw.js` (not just wired to a message
that was never actually being sent in auto mode) and that the app
itself works correctly against that build. What this sandbox can't
confirm is the exact reload timing on a real device across an actual
deploy boundary — if it ever seems to lag, force-quitting and reopening
(not just backgrounding) is the reliable fallback.

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
