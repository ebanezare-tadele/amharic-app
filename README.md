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
account with anyone.

## Persistence

Everything — `xp`, `cards`, streaks, and any letter/word/phrase you record
yourself — lives in this device's own `localStorage` by default, via
`src/lib/windowStorage.js`, a polyfill for the artifact sandbox's
`window.storage.get/set/delete` API. Single-device, no account, nothing
sent anywhere else, unless you turn on sync (below).

Audio clips you record are capped at ~700KB client-side — fine for a
one-second pronunciation clip, but keep that in mind if you ever want
longer audio.

## Syncing progress across devices (optional)

Off by default. Turned on from the Chart tab ("Sync across devices," near
"start over"): tap **create a sync code** on one device, then enter that
same code on another to bring your progress and recordings over. From
then on, changes on a linked device push automatically — no further
action needed on that device.

**No account, no email — the code is the only credential.** It's a
random 10-character string generated on-device
(`generateSyncCode()` in `src/lib/progressSync.js`), and it's genuinely
the only way in: the actual security lives in Postgres, not the app.
The `progress` table (in its own dedicated Supabase project — separate
from any other project on the account, specifically so this can't ever
touch unrelated data) has row-level security enabled with **no
policies at all**, which blocks all direct table access — no listing,
no enumeration, nothing readable without the exact code. The only way
to read or write is through two `SECURITY DEFINER` SQL functions,
`get_progress(code)` / `put_progress(code, state)`, each scoped to the
one row matching that exact code. That schema was applied directly to
the Supabase project via its migration tooling rather than living as a
file in this repo — nothing in this app's own source needs to define it.

The client talks to Supabase's REST endpoint with a plain `fetch()` — no
`@supabase/supabase-js` dependency — since the app only ever needs two
RPC calls, and the full SDK (auth/realtime/storage clients included)
would have added ~200KB to the bundle for that. The project URL and
publishable/anon key are hardcoded in `src/lib/progressSync.js`; that's
intentional, not an oversight — Supabase's anon key is designed to be
public, with RLS doing the actual access control, so there's nothing
to keep secret and no environment variable or build secret needed.

This is best-effort, last-write-wins sync — fine for one person's
progress across a couple of devices, not built for simultaneous editing
on two devices at once.

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

No environment variables needed for this deploy (the `ADDIS_API_KEY` repo
secret is only used by the separate, manually-triggered audio-generation
workflow — see "Hearing pronunciation" below).

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
rather than a plan that costs money from day one. Flagged per item below.

- ~~Cross-device personal progress~~ — built; see "Syncing progress
  across devices" above. Turned out not to need real accounts after
  all — a random per-device code plus database-level access control
  (no policies on the table itself, only two narrow functions) covers
  it without identifying anyone.
- **Push notifications** (e.g. "come back for today's lesson") — Web Push
  needs a server to hold subscriptions and trigger sends. *Cost: free* —
  a small serverless function on a cron trigger (Supabase Edge Functions,
  Cloudflare Workers + Cron Triggers, etc.) covers this at zero cost for
  personal-scale usage; no separate push-notification SaaS needed.
- **A custom domain** — not a new *platform* exactly, but a domain
  registrar account and DNS changes, if `github.io` ever feels wrong for
  texting to people. *Cost: not free* — domain registration is roughly
  $10-15/year regardless of registrar; there's no genuinely free version
  of "your own domain name." Skippable — the `github.io` URL costs
  nothing and already works.

Worth naming the one tension up front, cost aside: both of the first two
cut against the "no analytics, nothing sent anywhere else" story the app
currently tells about personal data. Not a blocker, just something to
weigh deliberately per feature rather than let creep in.

## Onboarding: the first-launch tour

New, not part of the original artifact — a five-step walkthrough (`Tour`
in `src/App.jsx`) shown once, before Home, on first launch: what the app
is, then one step per tab (Learn, Chart, Read & Write), ending on "Start
learning." Skippable at any step. Tracked in `state.seenIntro`, a field
the original artifact already had but never used — so this needed no new
persistence plumbing, just a use for a field that was already there.

Alongside it, a few small in-place tips (`Callout`) point out things that
aren't otherwise explained where they'd actually matter: what "level" and
the streak actually track (Home), and how recording your own voice
overrides the built-in pronunciation (Chart). Each shows once,
dismissible, same `seenIntro` tracking.

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

## Hearing pronunciation

"► hear it" buttons play, in order: **your own recording** if you've made
one (`Voice` — yours, or a relative's, saved locally on-device), else a
**verified official clip** if the generation pipeline below actually
produced and verified one for that exact letter/word/phrase, else the
**device's own Amharic voice** if the browser happens to ship one (rare —
iOS Safari never does). If none of those is available, the button
doesn't render at all rather than playing something that might be wrong.

### Why the official clips are trustworthy this time

An earlier version of this baked in a cloud-generated clip for every
letter/word/phrase by asking a text-to-speech API to read each one in
isolation — a single bare glyph, on its own. That failed repeatedly and
was pulled entirely (see git history around "Remove unreliable
cloud-generated audio" if you want the full postmortem). The root cause:
sentence-level TTS models are trained on continuous speech, not isolated
syllables, so a bare glyph with no sentence context is out-of-distribution
input — the model would sometimes pad or hallucinate it into a longer,
unrelated utterance. Measured directly: even after adding trailing
punctuation (the vendor's documented mitigation), ~1 in 5 letter/word
clips still came back 5–13 seconds long for input that should've produced
under 2 seconds of speech. A file-size-based QA pass caught only the most
extreme cases, because it could only measure duration, not content — a
wrong word at a plausible length sailed straight through it.

**`scripts/generate-official-audio.mjs` fixes that architecturally, and
verifies with signals that don't require any model to understand
Amharic at all:**

1. **Never ask for an isolated glyph.** A family's 7 letters are
   generated as one clip: the whole row recited naturally, e.g.
   `ለ፣ ሉ፣ ሊ፣ ላ፣ ሌ፣ ል፣ ሎ።` — which is literally how the fidel is
   traditionally chanted aloud, not an isolated syllable. That's a
   completely normal, in-distribution utterance for the model. Anchor
   words and phrases were already natural-shaped input and are
   unchanged.
2. **A real, measured duration check, not a file-size proxy.** Every
   clip gets its exact duration measured with `ffprobe` (already on the
   Actions runner — no install needed) and checked against a per-category
   sane band. Out-of-band clips get discarded and regenerated with a
   fresh idempotency key (up to 4 attempts); if one never lands in band,
   it simply isn't shipped rather than shipped with a caveat.
   
   A content-verification layer (transcribing every clip with
   [faster-whisper](https://github.com/SYSTRAN/faster-whisper) and
   comparing it to the expected text) was tried here and reverted — not
   because verifying content is a bad idea in principle, but because
   faster-whisper's available checkpoints turned out to have no real
   Amharic support: real smoke tests produced transcriptions in random
   unrelated scripts (Telugu, Bengali, Kazakh Cyrillic, Burmese) and even
   plain English words ("Quit", "flix"), changing on every attempt
   against the *same* audio — the signature of a model hallucinating on
   input it has no grip on, not a language it's merely weak at. The
   clips it rejected all had normal, in-band durations, meaning the
   underlying audio was plausibly fine the whole time and the
   verification layer was the thing sabotaging it. If this gets
   revisited, it needs a speech-recognition model with real Amharic
   training data behind it, not just a bigger generic multilingual
   checkpoint (bigger made it slower without making it more correct).
3. **Isolate letters mechanically, from a real acoustic signal.** Once a
   row clip's duration checks out, `ffmpeg`'s `silencedetect` filter
   finds the pauses between the 7 comma-separated syllables — a real,
   measurable signal (commas produce audible pauses in TTS output), not
   a claim about what was said — and slices the row into the 7
   individual `letter-{fam}-{order}.mp3` files the app actually plays.
   If the gap count doesn't roughly match what's expected, that row is
   rejected and regenerated rather than sliced on a guess. Nothing here
   requires understanding Amharic, so nothing here can hallucinate a
   wrong language.

**What ships, and what the app trusts:** the generation run writes
`manifest.json` alongside the clips, listing only what actually passed
verification. The app fetches that manifest once on load and only offers
the official-clip tier for entries actually listed in it (see
`officialKeyFromFilename` / the manifest fetch in `AmharicFidel` in
`src/App.jsx`) — an unverified clip is simply absent, not shipped with a
shrug. `public/audio/official/` isn't committed to the repo; it's
produced by the workflow below and only lands there when someone
downloads the artifact and copies it in after checking the run's own
report (failed/flagged counts) themselves.

**Running the generation** (`.github/workflows/generate-audio.yml`,
**Actions → Generate official audio (one-time) → Run workflow**): just
Node + `apt-get install ffmpeg` for `ffmpeg`/`ffprobe` (not reliably
preinstalled on the runner image — a real run failed with `spawn
ffprobe ENOENT` before that step was added), no other dependency, run
against the `ADDIS_API_KEY` repo secret. Tick **smoke_test** on the
workflow's "Run workflow" dialog to run just 3 jobs
(1 row, 1 anchor, 1 phrase) first — worth doing after touching the
script, since it exercises the whole pipeline (generation, verification,
slicing, manifest) for a couple of minutes and a few cents instead of
finding a bug only after the full ~82-job batch. The full run is much
cheaper than the original all-isolated-letters version: 34 row clips
instead of 238 isolated letters, plus 34 anchor words and 14 phrases —
82 generation calls total, not 286. Uploads the clips + `manifest.json`
as a downloadable build artifact (`amharic-audio`) — never auto-deployed;
check the run's own failed/flagged report first, then copy
`official-audio-out/*` into `public/audio/official/` and deploy normally.

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

- `src/App.jsx` — the entire app.
- `src/lib/windowStorage.js` — `window.storage` polyfill, routing
  everything to this device's own `localStorage`.
- `src/lib/progressSync.js` — the optional cross-device sync client (see
  "Syncing progress across devices" above).
- `scripts/generate-official-audio.mjs` — generates the baked-in
  pronunciation clips (see "Hearing pronunciation" above): orchestrates
  Addis AI generation/retries, ffprobe duration checks, and ffmpeg
  silence-gap slicing, all in one file (no other script/dependency).
- `scripts/gen-icons.mjs` + `scripts/icon-template.html` — icon generator.
- `.github/workflows/deploy.yml` — builds and publishes to GitHub Pages
  on every push to this branch.
- `.github/workflows/generate-audio.yml` — the manually-triggered
  audio-generation workflow (see "Hearing pronunciation" above for how
  to run it).
- `vite.config.js` — `base` for the GitHub Pages subpath, PWA plugin
  config (manifest contents, service worker caching strategy, including
  runtime caching for the Google Fonts the app's own injected CSS loads
  and for the official audio clips/manifest).
