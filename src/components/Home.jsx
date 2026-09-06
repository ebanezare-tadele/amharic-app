import { useState, useEffect, useMemo } from "react";
import { BASE_BATCHES, SWEEPS, UNITS, FAMS, ORDERS, NUMERAL_BATCHES, GEEZ_NUM } from "../content.js";
import { WORD_FAM } from "../audio.js";
import { key, DAY, todayStamp } from "../state.js";
import { ALL } from "./Lesson.jsx";
import { Callout } from "./Callout.jsx";
import { SectionHeader } from "./SectionHeader.jsx";
import { questsForDay, emptyToday, MAX_FREEZES } from "../lib/gamification.js";
import { onInstallPromptAvailable, isIOSDevice } from "../lib/installPrompt.js";

/* ============================================================
   THE SIX MONTHS
   18 lessons: 34 base shapes in three weeks, then one vowel
   column roughly every ten days, then six weeks of nothing but
   reading and writing.
   ============================================================ */

const PLAN_DAYS = 182;
const TOTAL_LESSONS = BASE_BATCHES.length + SWEEPS.length;

function expectedBy(day) {
  if (day <= 21) return (BASE_BATCHES.length * day) / 21;
  if (day <= 140) return BASE_BATCHES.length + (SWEEPS.length * (day - 21)) / 119;
  return TOTAL_LESSONS;
}

function phaseOf(day) {
  if (day <= 21) return "Weeks 1–3 · the 34 shapes";
  if (day <= 140) return "Weeks 4–20 · one vowel column at a time";
  return "Weeks 21–26 · reading and writing only";
}

export function Plan({ state, dueCount, nextLabel }) {
  const day = Math.max(1, Math.floor((Date.now() - (state.startDate || Date.now())) / DAY) + 1);
  const done = (state.basesDone || []).length + (state.sweepsDone || []).length;
  const target = expectedBy(Math.min(day, PLAN_DAYS));
  const drift = done - target;
  const status =
    drift >= 1 ? `${Math.floor(drift)} ahead` : drift <= -1 ? `${Math.ceil(-drift)} behind` : "on pace";

  const today = dueCount > 0 ? `Clear ${dueCount} review${dueCount > 1 ? "s" : ""}, then ${nextLabel}` : nextLabel;

  return (
    <div className="card" style={{ borderColor: drift <= -2 ? "var(--rubric)" : "var(--line)" }}>
      <div className="row-sp">
        <span className="eyebrow">Day {Math.min(day, PLAN_DAYS)} of {PLAN_DAYS}</span>
        <span className="pill" style={{ color: drift <= -2 ? "var(--rubric)" : drift >= 1 ? "var(--gold)" : "var(--dim)" }}>
          {status}
        </span>
      </div>
      <div className="card-title" style={{ fontSize: 19, marginTop: 4 }}>{phaseOf(day)}</div>
      <div className="meter" style={{ marginTop: 10 }}>
        <i style={{ width: `${(done / TOTAL_LESSONS) * 100}%` }} />
      </div>
      <div className="card-blurb" style={{ marginTop: 8 }}>
        {done} of {TOTAL_LESSONS} lessons done · <b style={{ color: "var(--bone)" }}>today: {today}</b>
      </div>
      <div className="note" style={{ marginTop: 10, fontSize: 11, borderTop: "1px solid var(--line)", paddingTop: 9 }}>
        Fifteen minutes a day clears this with room to spare. Worth being straight with you though: six
        months gets you <b style={{ color: "var(--bone)" }}>decoding</b> — you'll sound out any word you
        see. Understanding what you've sounded out is vocabulary and grammar, a separate and much longer
        project this doesn't cover.
      </div>
    </div>
  );
}

/* ============================================================
   HOME
   ============================================================ */

export function Thesis({ track }) {
  const [o, setO] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setO((x) => (x + 1) % 7), 1500);
    return () => clearInterval(id);
  }, []);
  const F = FAMS[3];
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 18, padding: "18px 14px 16px", background: "var(--ink2)", marginBottom: 16 }}>
      <div className="eyebrow" style={{ textAlign: "center" }}>One shape · seven vowels</div>
      <div className="rubric" style={{ paddingBottom: 6 }}>
        {F.chars.map((c, i) => (
          <div key={i} className={"rcell" + (i === o ? " on" : " known")}>{c}</div>
        ))}
      </div>
      <div style={{ textAlign: "center" }}>
        <span className="disp" style={{ fontSize: 26 }}>{F.rom[o]}</span>
        <span className="note" style={{ marginLeft: 8 }}>{ORDERS[o].say}</span>
      </div>
      <p className="note" style={{ textAlign: "center", marginTop: 10, fontSize: 12 }}>
        Amharic doesn't spell vowels separately. It bends the consonant. 34 shapes and 7 bends gets you
        all 238 letters.
      </p>
    </div>
  );
}

export function LessonCard({ open, done, fidel, title, blurb, count, onClick }) {
  // count tracks ongoing mastery (spaced-repetition review, separate from
  // this lesson itself) — it can genuinely still read low right after
  // finishing a lesson for the first time, since that only takes a
  // letter from unseen to barely-seen, not to "mastered." Showing that
  // raw count next to done's green border read as a contradiction ("why
  // does it say done but 0/6?"); "done" here instead matches what the
  // border already says, and the mastery count still drives the review
  // queue and Chart brightness in the background exactly as before.
  const pill = !open ? "locked" : done ? "done" : count;
  return (
    <button className={"card" + (done ? " done" : "") + (open ? "" : " locked")} disabled={!open} onClick={onClick}>
      <div className="card-head"><span className="card-fidel">{fidel}</span></div>
      <div className="row-sp">
        <span className="card-title">{title}</span>
        <span className="pill" style={done ? { background: "rgba(79,154,118,.2)", color: "#8FD9B4" } : undefined}>
          {pill}
        </span>
      </div>
      <div className="card-blurb" style={{ marginTop: 4 }}>{blurb}</div>
    </button>
  );
}

/* ============================================================
   SPOTLIGHT
   First-launch walkthrough, redesigned around a real complaint:
   the old Tour replaced the whole Home screen with generic slides
   before letting anyone see the actual app. This instead renders
   Home immediately underneath and dims everything BUT a highlight
   ring around a real element (found via the data-tour attributes
   sprinkled through the JSX below), so people click through actual
   pieces of the actual interface. Re-openable anytime via the "?"
   button in the top bar, not just a one-time first-launch thing.
   ============================================================ */

const SPOTLIGHT_STEPS = [
  { target: null, title: "Welcome to ፊደል", body: "A 60-second look at where everything lives. Skip anytime — this doesn't come back uninvited." },
  { target: "topbar", title: "Level & XP", body: "Every lesson, review, and drill earns XP. 250 XP clears a level." },
  { target: "tabs", title: "Five ways to practice", body: "Learn teaches new letters. Chart is the whole fidel at a glance, tap any letter to hear or record it. More has the numerals, the script's history, anchor words and phrases, and syncing across devices. Read puts real sentences in front of you. Write is free-hand tracing, scored against the actual shape." },
  { target: "quests", title: "Daily quests", body: "Three quick goals every day for bonus XP — they reset each morning, so a couple minutes keeps a streak alive even on a busy day." },
  { target: "stage", title: "Your path", body: "Tap any card here to start that lesson. Each one unlocks once the one before it's done." },
  { target: null, title: "That's it", body: "Tap the ? up top anytime to see this again. Let's go." },
];

export function Spotlight({ onDone }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = SPOTLIGHT_STEPS[i];
  const last = i === SPOTLIGHT_STEPS.length - 1;

  useEffect(() => {
    if (!step.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    // scrollIntoView is smooth/async -- re-measure once it's likely settled,
    // and keep tracking resize/scroll so the ring doesn't drift out of place.
    const t = setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [i]);

  const pad = 8;
  const cardOnTop = rect && rect.top > window.innerHeight * 0.55;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      {rect ? (
        <div
          style={{
            position: "fixed",
            left: rect.left - pad, top: rect.top - pad,
            width: rect.width + pad * 2, height: rect.height + pad * 2,
            borderRadius: 14,
            boxShadow: "0 0 0 9999px rgba(6,9,20,0.84)",
            border: "2px solid var(--rubric)",
            pointerEvents: "none",
            transition: "left .2s ease, top .2s ease, width .2s ease, height .2s ease",
          }}
        />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(6,9,20,0.84)" }} />
      )}

      <div
        className="card"
        style={{
          position: "fixed", left: "50%", transform: "translateX(-50%)",
          ...(cardOnTop ? { top: 20 } : { bottom: 20 }),
          width: "calc(100% - 32px)", maxWidth: 380, borderColor: "var(--rubric)",
        }}
      >
        <div className="row-sp" style={{ marginBottom: 8 }}>
          <span className="eyebrow">{i + 1} of {SPOTLIGHT_STEPS.length}</span>
          <button onClick={onDone} style={{ color: "var(--dim)", fontSize: 16 }}>Skip ✕</button>
        </div>
        <div className="disp" style={{ fontSize: 21, marginBottom: 8 }}>{step.title}</div>
        <p className="note" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>{step.body}</p>
        <button className="btn" style={{ width: "100%" }} onClick={() => (last ? onDone() : setI(i + 1))}>
          {last ? "Let's go" : "Next"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   INSTALL HELP
   How to get ፊደል onto your actual home screen -- previously a
   one-shot inline banner on Home that vanished for good the moment
   anyone dismissed it (or scrolled past it once and never came
   back). Now an overlay, same as Spotlight below: still opens
   automatically the first time, but also stays reachable forever
   after via the persistent top-bar button (App.jsx), from any tab
   -- someone who dismissed it, or who only wonders "wait, can I
   save this?" three sessions in, has an obvious, permanent way back
   in instead of one vanished chance.

   Chrome/Edge/Android expose a real programmatic install prompt
   (beforeinstallprompt, captured in src/lib/installPrompt.js as
   early as possible since it can fire before this even mounts) —
   there, this is one tap. iOS Safari has no such API at all; the
   only path is the manual Share -> Add to Home Screen menu, so
   there it shows those steps instead of a button.
   ============================================================ */

export function InstallHelp({ onClose }) {
  const [prompt, setPrompt] = useState(null);
  useEffect(() => onInstallPromptAvailable(setPrompt), []);

  const ios = isIOSDevice();
  // Used to return null here on Android/desktop Chrome whenever
  // beforeinstallprompt hadn't fired yet -- meaning anyone Chrome hasn't
  // yet decided to offer a real install to saw NOTHING, no explanation at
  // all. That's exactly the confusing case a real user hit: no button,
  // and manually using the browser's own "Add to Home screen" just makes
  // a bookmark shortcut (opens in a new browser tab forever after, not a
  // standalone app) -- indistinguishable from a real install unless
  // someone tells you. Show the explanation either way now; only the
  // actual button is conditional on a captured prompt.

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "fixed", inset: 0, background: "rgba(6,9,20,0.84)" }} onClick={onClose} />
      <div className="card" style={{ position: "relative", borderColor: "var(--gold)", maxWidth: 380, width: "100%" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ color: "var(--gold)", marginBottom: 4 }}>Save ፊደል to your home screen</div>
            <div className="note" style={{ color: "var(--bone)", fontSize: 12.5 }}>
              {ios ? (
                <>
                  Opens faster and works offline as its own app. Works best in <b>Safari</b> specifically —
                  tap the <b>Share</b> button (the square with an arrow), then <b>Add to Home Screen</b>. On
                  Chrome, if it offers an <b>"Open as Web App"</b> toggle, turn it off — a real user hit this:
                  left on, the icon kept opening fresh tabs instead of reopening reliably (Chrome on iPhone
                  can't actually host a standalone app the way Safari can).
                </>
              ) : prompt ? (
                <>Opens faster and works offline as its own app, off your home screen — no browser bar.</>
              ) : (
                <>
                  Look for <b>Install app</b> in Chrome's <b>⋮</b> menu — not "Add to Home screen," which just
                  saves a bookmark that reopens in the browser (and can pile up new tabs) instead of its own app
                  window. If Chrome only offers "Add to Home screen" right now, it hasn't decided to offer the
                  real install yet — that's Chrome's own call, not something this app can force, and it usually
                  comes after a couple more visits.
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ color: "var(--dim)", fontSize: 16, lineHeight: 1, padding: 2 }}>
            ✕
          </button>
        </div>
        {!ios && prompt && (
          <button className="btn" style={{ marginTop: 10, width: "100%" }} onClick={install}>
            Install ፊደል
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   BADGES
   Milestones computed straight from state that already exists —
   no separate "earned" list to persist, so there's nothing to get
   out of sync. Tap one to see what it takes.
   ============================================================ */

const BADGES = [
  { id: "first", glyph: "1", label: "First step", hint: "Learn your first letter.", need: (c) => c.known.size >= 1 },
  { id: "bases", glyph: "34", label: "The 34", hint: "All 34 base shapes learned.", need: (c) => c.allBases },
  { id: "full", glyph: "238", label: "Full fidel", hint: `Every letter, every vowel — all ${ALL.length}, both tracks converge here.`, need: (c) => c.known.size >= ALL.length },
  { id: "lvl5", glyph: "5", label: "Level 5", hint: "Reach level 5 — 1,000 XP from drills, review, words, writing, or the speed round.", need: (c) => c.level >= 5 },
  { id: "mastered", glyph: "10", label: "Ten mastered", hint: "Ten letters at full brightness on the chart (level 5 or higher).", need: (c) => c.masteredCount >= 10 },
  { id: "streak", glyph: "7", label: "Week streak", hint: "Open the app seven days running.", need: (c) => c.state.streakDays >= 7 },
  { id: "speed", glyph: "15", label: "Quick draw", hint: "Score 15 or higher in the speed round.", need: (c) => c.state.bestSpeed >= 15 },
  { id: "voice", glyph: "●", label: "Family voice", hint: "Record your first letter — yours, or a relative's.", need: (c) => c.audioCount >= 1 },
  { id: "numerals", glyph: "፻", label: "Numerals", hint: "Finish both numeral stages — one through a hundred.", need: (c) => c.allNumerals },
];

export function Badges({ state, known, level, allBases, audioCount, allNumerals }) {
  const [sel, setSel] = useState(null);
  const masteredCount = useMemo(
    () => Object.values(state.cards).filter((c) => (c.lvl || 0) >= 5).length,
    [state.cards]
  );
  const ctx = { known, level, allBases, masteredCount, state, audioCount, allNumerals };
  const selBadge = BADGES.find((b) => b.id === sel);
  return (
    <div>
      <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Badges</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {BADGES.map((b) => {
          const earned = b.need(ctx);
          return (
            <button
              key={b.id}
              onClick={() => setSel(sel === b.id ? null : b.id)}
              style={{
                background: earned ? "rgba(217,169,60,.12)" : "var(--ink2)",
                border: "1px solid " + (earned ? "var(--gold)" : "var(--line)"),
                borderRadius: 9, padding: "7px 10px", textAlign: "center", minWidth: 56,
              }}
            >
              <div className="disp" style={{ fontSize: 18, color: earned ? "var(--gold)" : "var(--dim)" }}>
                {b.glyph}
              </div>
              <div className="note" style={{ fontSize: 9.5, marginTop: 2, color: earned ? "var(--bone)" : "var(--dim)" }}>
                {b.label}
              </div>
            </button>
          );
        })}
      </div>
      {selBadge && (
        <div className="note" style={{ marginTop: 10, fontSize: 11.5 }}>
          <b style={{ color: "var(--bone)" }}>{selBadge.label}</b>
          <span style={{ color: selBadge.need(ctx) ? "var(--gold)" : "var(--dim)" }}>
            {selBadge.need(ctx) ? " — earned. " : " — locked. "}
          </span>
          {selBadge.hint}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   DAILY QUESTS
   Same 3 (of a pool of 4) for everyone on a given calendar day —
   see questsForDay in src/lib/gamification.js for why that's
   deterministic rather than random. Progress and payout both come
   from state.today, which every XP-earning action already updates
   via bumpToday (see AmharicFidel below) — this component only reads.
   ============================================================ */

export function DailyQuests({ today }) {
  const day = todayStamp();
  const quests = questsForDay(day);
  const t = today && today.day === day ? today : emptyToday(day);

  return (
    <div className="card" data-tour="quests" style={{ padding: "12px 14px", marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Today's quests</div>
      {quests.map((q) => {
        const done = t.claimed.includes(q.id);
        const progress = Math.min(q.get(t), q.target);
        return (
          <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
            <span style={{ fontSize: 15, color: done ? "var(--gold)" : "var(--dim)", width: 16, textAlign: "center" }}>
              {done ? "✓" : "○"}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, color: done ? "var(--dim)" : "var(--bone)", textDecoration: done ? "line-through" : "none" }}>
                {q.label}
              </div>
              {!done && (
                <div style={{ height: 3, background: "var(--ink3)", borderRadius: 2, marginTop: 4 }}>
                  <div style={{ height: 3, width: `${(progress / q.target) * 100}%`, background: "var(--rubric)", borderRadius: 2 }} />
                </div>
              )}
            </div>
            <span className="pill" style={{ fontSize: 10, opacity: done ? 0.5 : 1 }}>+{q.reward} xp</span>
          </div>
        );
      })}
    </div>
  );
}

export function Home({ state, dueCount, level, known, onStart, onReview, onSpeed, track, setTrack, seenIntro, onSeen, audioCount }) {
  const bDone = new Set(state.basesDone || []);
  const sDone = new Set(state.sweepsDone || []);
  const uDone = new Set(state.unitsDone || []);
  const allBases = BASE_BATCHES.every((b) => bDone.has(b.id));

  const solid = (f, o) => ((state.cards[key(f, o)] || {}).lvl || 0) >= 3;
  const solidNum = (idx) => ((state.cards[key(WORD_FAM.numeral, idx)] || {}).lvl || 0) >= 3;
  const numDone = new Set(state.numeralsDone || []);
  const allNumerals = NUMERAL_BATCHES.every((b) => numDone.has(b.id));

  // Feature-detected, not assumed -- navigator.share exists on iOS/Android
  // browsers and some desktop ones, not all (same pattern as the PWA
  // install prompt elsewhere in this file). No account, no server round
  // trip: it just hands plain text to whatever the OS share sheet offers.
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareProgress = () => {
    // Whoever gets this has never seen the app before -- exact copy the
    // user asked for: a real product description up front (not a stat
    // flex) plus both platforms' home-screen instructions, since this
    // travels in the message itself and the in-app banner/Callouts can't
    // reach someone before they've opened the link at all.
    const text = `ፊደል — read Amharic in a few minutes a day. Daily lessons, spaced review that catches what you forget, tracing practice, and a reader for real text.\n\nAdd it to your home screen and it opens like a real app, even offline:\n• iPhone (Safari): Share icon → Add to Home Screen\n• iPhone (Chrome): Share icon → Add to Home Screen (turn off "Open as Web App" if it asks, or the icon reopens a fresh tab every time instead of the app)\n• Android (Chrome): ⋮ menu → Add to Home Screen`;
    navigator.share({ text, url: window.location.href }).catch(() => {});
  };

  // Purely a per-visit UI preference (not persisted) -- collapsing a
  // stage just saves scroll room while you're looking at the other one,
  // it's not a setting worth remembering across sessions.
  const [openStages, setOpenStages] = useState({ stage1: true, stage2: false, rows: true, stage3: false });
  const toggleStage = (id) => setOpenStages((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div className="wrap" style={{ paddingTop: 18, paddingBottom: 30 }}>
      <Thesis />

      {(() => {
        const nb = BASE_BATCHES.find((b, i) => !bDone.has(b.id) && (i === 0 || bDone.has(BASE_BATCHES[i - 1].id)));
        const ns = allBases && SWEEPS.find((w, i) => !sDone.has(w.id) && (i === 0 || sDone.has(SWEEPS[i - 1].id)));
        const label = nb ? nb.title : ns ? `${ns.title}, part ${ns.part}` : "read and write";
        return <Plan state={state} dueCount={dueCount} nextLabel={label} />;
      })()}

      <div className="row-sp" style={{ marginBottom: 16, marginTop: 16 }}>
        <div className="stat"><b>{level}</b><span>level</span></div>
        <div className="stat"><b>{known.size}</b><span>letters known</span></div>
        <div className="stat"><b>{state.streakDays}</b><span>day streak</span></div>
      </div>

      {state.streakFreezes > 0 && (
        <div className="note" style={{ textAlign: "center", fontSize: 11, marginTop: -10, marginBottom: 4 }}>
          ❄️ {state.streakFreezes} freeze{state.streakFreezes > 1 ? "s" : ""} saved — a missed day won't break the streak
        </div>
      )}

      {canShare && (
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <button className="speaker" onClick={shareProgress}>share your progress</button>
        </div>
      )}

      <Callout id="cb-stats" seenIntro={seenIntro} onSeen={onSeen}>
        Level is just total XP in disguise — 250 XP per level, earned across lessons, review, word
        building, tracing, and the speed round. The streak counts by calendar day, from opening the
        app — it's on the honor system, not tied to actually finishing anything. Every 7-day milestone
        banks a freeze (up to {MAX_FREEZES}): miss a day with one saved and the streak survives anyway.
      </Callout>

      <DailyQuests today={state.today} />

      {dueCount > 0 && (
        <button className="card" style={{ borderColor: "var(--rubric)" }} onClick={onReview}>
          <div className="card-head"><span className="card-fidel">ደግም</span></div>
          <div className="card-title" style={{ fontSize: 19 }}>{dueCount} letters are fading</div>
          <div className="card-blurb">Review them now and they hold for weeks instead of days.</div>
        </button>
      )}

      <div style={{ display: "flex", gap: 6, margin: "18px 0 6px", background: "var(--ink2)", padding: 4, borderRadius: 12, border: "1px solid var(--line)" }}>
        {[["bases", "Bases first"], ["rows", "Full rows"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTrack(id)}
            style={{
              flex: 1, padding: "9px 6px", borderRadius: 9, fontSize: 13, fontWeight: 600,
              background: track === id ? "var(--rubric)" : "transparent",
              color: track === id ? "#fff" : "var(--dim)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="note" style={{ margin: "8px 0 16px", fontSize: 11.5 }}>
        {track === "bases"
          ? "Learn all 34 base shapes, then sweep one vowel column at a time across every letter. If you already have the chant rhythm in your head, this is the faster road: the chant hands you the seven sounds for free, so the only new work is spotting the mark."
          : "Take one row at a time, all seven vowels together. You read real words within a day, but the vowel marks stay implicit longer."}
      </p>

      <Callout id="cb-track" seenIntro={seenIntro} onSeen={onSeen}>
        These two tracks aren't a one-time choice — switch anytime, for free. They feed the same
        progress, the same review queue, the same chart.
      </Callout>

      {track === "bases" ? (
        <>
          <SectionHeader
            open={openStages.stage1}
            onToggle={() => toggleStage("stage1")}
            title="Stage one · the 34 shapes"
            done={BASE_BATCHES.filter((b) => bDone.has(b.id)).length}
            total={BASE_BATCHES.length}
            style={{ margin: "18px 0 10px" }}
            dataTour="stage"
          />
          {openStages.stage1 && BASE_BATCHES.map((b, i) => {
            const open = i === 0 || bDone.has(BASE_BATCHES[i - 1].id);
            const n = b.fams.filter((f) => solid(f, 0)).length;
            return (
              <LessonCard
                key={b.id}
                open={open}
                done={bDone.has(b.id)}
                fidel={b.fams.map((f) => FAMS[f].chars[0]).join("")}
                title={b.title}
                blurb={b.blurb}
                count={`${n}/${b.fams.length}`}
                onClick={() => onStart({ kind: "base", id: b.id, fams: b.fams, orders: [0], doneLabel: "Shapes locked in" })}
              />
            );
          })}

          <SectionHeader
            open={openStages.stage2}
            onToggle={() => toggleStage("stage2")}
            title="Stage two · the six vowel columns"
            done={SWEEPS.filter((sw) => sDone.has(sw.id)).length}
            total={SWEEPS.length}
            style={{ margin: "22px 0 8px" }}
          />
          {openStages.stage2 && (
            <>
              <p className="note" style={{ marginBottom: 10, fontSize: 11.5 }}>
                {allBases ? "Taught most-regular first. The ə column comes last because it barely follows a rule." : "Opens once all 34 base shapes are done."}
              </p>
              {SWEEPS.map((sw, i) => {
                const open = allBases && (i === 0 || sDone.has(SWEEPS[i - 1].id));
                const n = sw.fams.filter((f) => solid(f, sw.order)).length;
                return (
                  <LessonCard
                    key={sw.id}
                    open={open}
                    done={sDone.has(sw.id)}
                    fidel={[0, 1, 3, 7].map((f) => FAMS[f].chars[sw.order]).join("")}
                    title={`${sw.title} · part ${sw.part}`}
                    blurb={sw.blurb}
                    count={`${n}/${sw.fams.length}`}
                    onClick={() => onStart({ kind: "sweep", id: sw.id, fams: sw.fams, orders: [sw.order], doneLabel: `${ORDERS[sw.order].v} column, part ${sw.part}` })}
                  />
                );
              })}
            </>
          )}
        </>
      ) : (
        <>
          <SectionHeader
            open={openStages.rows}
            onToggle={() => toggleStage("rows")}
            title="Rows, four at a time"
            done={UNITS.filter((u) => uDone.has(u.n)).length}
            total={UNITS.length}
            style={{ margin: "0 0 10px" }}
          />
          {openStages.rows && UNITS.map((u, i) => {
            const open = i === 0 || uDone.has(UNITS[i - 1].n);
            const n = u.fams.reduce((a, f) => a + ORDERS.filter((_, o) => solid(f, o)).length, 0);
            return (
              <LessonCard
                key={u.n}
                open={open}
                done={uDone.has(u.n)}
                fidel={u.fams.map((f) => FAMS[f].chars[0]).join("")}
                title={u.title}
                blurb={u.blurb}
                count={`${n}/${u.fams.length * 7}`}
                onClick={() => onStart({ kind: "unit", id: u.n, fams: u.fams, orders: [0, 1, 2, 3, 4, 5, 6], doneLabel: `Unit ${u.n} cleared` })}
              />
            );
          })}
        </>
      )}

      <div className="rule" />
      <SectionHeader
        open={openStages.stage3}
        onToggle={() => toggleStage("stage3")}
        title="Stage three · Ge'ez numerals"
        done={NUMERAL_BATCHES.filter((b) => numDone.has(b.id)).length}
        total={NUMERAL_BATCHES.length}
        style={{ margin: "18px 0 10px" }}
      />
      {openStages.stage3 && (
        <>
          <p className="note" style={{ marginBottom: 10, fontSize: 11.5 }}>
            A separate, parallel track — no vowel marks, no unlocking by letter progress. One through
            nine first, then the tens and the hundred.
          </p>
          {NUMERAL_BATCHES.map((b, i) => {
            const open = i === 0 || numDone.has(NUMERAL_BATCHES[i - 1].id);
            const n = b.indices.filter((idx) => solidNum(idx)).length;
            return (
              <LessonCard
                key={b.id}
                open={open}
                done={numDone.has(b.id)}
                fidel={b.indices.map((idx) => GEEZ_NUM[idx][0]).join("")}
                title={b.title}
                blurb={b.blurb}
                count={`${n}/${b.indices.length}`}
                onClick={() => onStart({ kind: "numeral", id: b.id, indices: b.indices, blurb: b.blurb, doneLabel: b.doneLabel })}
              />
            );
          })}
        </>
      )}

      <div className="rule" />

      <button className="card" onClick={onSpeed} disabled={known.size < 6}>
        <div className="card-head"><span className="card-fidel">ፍጥነት</span></div>
        <div className="row-sp">
          <span className="card-title">Speed round</span>
          <span className="pill">{known.size < 6 ? "locked" : `best ${state.bestSpeed}`}</span>
        </div>
        <div className="card-blurb" style={{ marginTop: 4 }}>
          Sixty seconds, no hints. This is what turns recognition into reflex.
        </div>
      </button>

      <Badges state={state} known={known} level={level} allBases={allBases} audioCount={audioCount} allNumerals={allNumerals} />

      <p className="note" style={{ marginTop: 14, textAlign: "center", fontSize: 11.5 }}>
        Both tracks feed the same chart, the same review queue, and the same writing practice. Switching
        between them costs you nothing.
      </p>
    </div>
  );
}
