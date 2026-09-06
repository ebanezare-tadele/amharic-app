import { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";
import { getSavedSyncCode, gatherBundle, pushBundle } from "./lib/progressSync.js";
import { applyTodayPatch, emptyToday, rollStreak } from "./lib/gamification.js";
import { FAMS, UNITS, BASE_BATCHES, SWEEPS, ORDERS } from "./content.js";
import { key, DAY, INTERVALS, loadState, saveState, flushSave, todayStamp, emptyState, setSaveFailureNotifier } from "./state.js";
import { loadAudIndex } from "./lib/clipStorage.js";
import { isStandalone } from "./lib/installPrompt.js";
import { Lesson } from "./components/Lesson.jsx";
import { NumeralLesson } from "./components/Numerals.jsx";
import { Chart } from "./components/Chart.jsx";
import { More } from "./components/More.jsx";
import { Reader } from "./components/Reader.jsx";
import { WordBuild, Speed } from "./components/Drills.jsx";
import { Trace } from "./components/Practice.jsx";
import { Home, Spotlight, InstallHelp } from "./components/Home.jsx";

/* ============================================================
   THE FIDEL (ፊደል)
   34 consonant families x 7 vowel orders. Content (the letters,
   words, phrases, sentences, lesson curriculum) lives in
   src/content.js; persistence and spaced-repetition helpers live
   in src/state.js; every screen is a component under
   src/components/. This file is just the root component: state,
   effects, and the tab-level layout that wires them together.
   ============================================================ */

export default function AmharicFidel() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("learn");
  const [track, setTrack] = useState("bases");
  const [haveAudio, setHaveAudio] = useState(new Set());
  const [wordTab, setWordTab] = useState("read");
  const [lesson, setLesson] = useState(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const introChecked = useRef(false);

  useEffect(() => {
    setSaveFailureNotifier(() => setSaveFailed(true));
    return () => setSaveFailureNotifier(() => {});
  }, []);

  // Home renders immediately either way -- this only decides whether the
  // Spotlight overlay auto-opens on top of it once state has actually
  // loaded (state starts null; see loadState() above). introChecked
  // guards against re-opening on every later state change once this
  // has run once. Install help only auto-opens here if the tour ISN'T
  // about to (never stack two overlays on first load) -- a brand-new
  // user sees the tour first and finds install help afterward via the
  // always-visible top-bar button; a returning user who's already past
  // the tour but never dismissed this gets it automatically like before.
  useEffect(() => {
    if (state && !introChecked.current) {
      introChecked.current = true;
      if (!state.seenIntro.includes("app-tour")) setShowTour(true);
      else if (!state.seenIntro.includes("cb-install") && !isStandalone()) setShowInstallHelp(true);
    }
  }, [state]);

  useEffect(() => {
    loadState().then((s) => {
      const t = todayStamp();
      const y = new Date(Date.now() - DAY);
      const ys = `${y.getFullYear()}-${y.getMonth()}-${y.getDate()}`;
      const rolled = rollStreak({ streakDays: s.streakDays, streakFreezes: s.streakFreezes, lastDay: s.lastDay, yesterdayStamp: ys, todayDay: t });
      s.streakDays = rolled.streakDays;
      s.streakFreezes = rolled.streakFreezes;
      s.lastDay = t;
      s.today = applyTodayPatch(s.today, t, {}).today;
      s.basesDone = s.basesDone || [];
      s.sweepsDone = s.sweepsDone || [];
      s.numeralsDone = s.numeralsDone || [];
      if (!s.startDate) s.startDate = Date.now();
      setState(s);
      if (s.track) setTrack(s.track);
      loadAudIndex().then(setHaveAudio);
    });
  }, []);

  // cards/xp are here specifically so a finished lesson (including a
  // review session, which never touches basesDone/sweepsDone/unitsDone)
  // always counts as structural, matching saveState's own "anything
  // you'd be upset to lose" comment -- an earlier version of this list
  // omitted them, so a completed review only got the 250ms-debounced
  // save like routine progress.
  const lastSig = useRef("");
  useEffect(() => {
    if (!state) return;
    const sig = JSON.stringify([
      state.basesDone, state.sweepsDone, state.unitsDone, state.numeralsDone,
      state.bestSpeed, state.startDate, state.cards, state.xp, track,
    ]);
    const structural = sig !== lastSig.current;
    lastSig.current = sig;
    saveState({ ...state, track }, structural);
  }, [state, track]);

  // Once a device is linked (SyncPanel, on the Chart tab), push whatever
  // changed — progress or a new/removed recording — up automatically, so
  // the other device sees it on its next open. No-op, silently, if this
  // device was never linked or the request fails; sync is best-effort by
  // design, not something a lesson should ever block on.
  useEffect(() => {
    if (!state) return;
    const code = getSavedSyncCode();
    if (!code) return;
    const t = setTimeout(() => {
      gatherBundle().then((bundle) => pushBundle(code, bundle)).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [state, haveAudio]);

  // phones background apps without warning; get it to disk before that happens
  useEffect(() => {
    const f = () => flushSave();
    const vis = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    window.addEventListener("pagehide", f);
    window.addEventListener("blur", f);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("pagehide", f);
      window.removeEventListener("blur", f);
      document.removeEventListener("visibilitychange", vis);
      f();
    };
  }, []);

  const pool = useMemo(() => {
    if (!state) return [];
    const seen = new Set();
    const p = [];
    const add = (f, o) => {
      const k = key(f, o);
      if (!seen.has(k)) { seen.add(k); p.push({ fam: f, order: o }); }
    };
    const uD = state.unitsDone || [], bD = state.basesDone || [], sD = state.sweepsDone || [];
    UNITS.forEach((u) => { if (uD.includes(u.n)) u.fams.forEach((f) => ORDERS.forEach((_, o) => add(f, o))); });
    BASE_BATCHES.forEach((b) => { if (bD.includes(b.id)) b.fams.forEach((f) => add(f, 0)); });
    SWEEPS.forEach((sw) => { if (sD.includes(sw.id)) sw.fams.forEach((f) => add(f, sw.order)); });
    return p;
  }, [state]);

  const unlockedFams = useMemo(() => new Set(pool.map((p) => p.fam)), [pool]);
  const known = useMemo(() => new Set(pool.map((p) => FAMS[p.fam].chars[p.order])), [pool]);

  const due = useMemo(() => {
    if (!state) return [];
    const now = Date.now();
    return pool.filter((p) => {
      const c = state.cards[key(p.fam, p.order)];
      return c && c.lvl > 0 && c.due <= now;
    });
  }, [state, pool]);

  if (!state) {
    return (
      <div className="fd">
        <div className="wrap" style={{ paddingTop: 80, textAlign: "center" }}>
          <div className="gz" style={{ fontSize: 40, color: "var(--rubric)" }}>ፊደል</div>
        </div>
      </div>
    );
  }

  const level = Math.floor(state.xp / 250) + 1;
  const pct = ((state.xp % 250) / 250) * 100;

  // Rolls a same-day quest-progress patch into state.today (see
  // src/lib/gamification.js), returning both the updated today object
  // and any bonus XP a quest just newly completed — call inside a
  // setState updater alongside whatever else that action already does,
  // same pattern at every XP-earning call site below.
  const bumpToday = (s, patch) => applyTodayPatch(s.today, todayStamp(), patch);

  const grade = (results) => {
    const now = Date.now();
    setState((s) => {
      const cards = { ...s.cards };
      results.forEach((r) => {
        const k = key(r.fam, r.order);
        const c = cards[k] || { lvl: 0, seen: 0, due: now };
        const lvl = r.ok ? Math.min(6, c.lvl + 1) : Math.max(0, c.lvl - 1);
        cards[k] = { lvl, seen: c.seen + 1, due: now + INTERVALS[lvl] * DAY };
      });
      return { ...s, cards };
    });
  };

  const addXp = (n) => setState((s) => {
    const { today, bonusXp } = bumpToday(s, { xp: n });
    return { ...s, xp: s.xp + n + bonusXp, today };
  });
  const audio = {
    have: haveAudio,
    onSaved: (idx) => setHaveAudio(new Set(idx)),
  };

  const resetAll = () => {
    const fresh = { ...emptyState(), startDate: Date.now(), lastDay: todayStamp(), streakDays: 1, today: emptyToday(todayStamp()) };
    lastSig.current = "";
    setState(fresh);
    saveState({ ...fresh, track }, true);
  };

  // Marks a tour step / callout as seen — app-tour for the first-launch
  // walkthrough, cb-* ids for the in-place tips (see Callout).
  const markSeen = (id) =>
    setState((s) => (s.seenIntro.includes(id) ? s : { ...s, seenIntro: [...s.seenIntro, id] }));

  if (lesson) {
    const onLessonDone = (results, xp) => {
      grade(results);
      setState((s) => {
        const correct = results.filter((r) => r.ok).length;
        const { today, bonusXp } = bumpToday(s, { xp, lessonsDone: 1, correct });
        const n = { ...s, xp: s.xp + xp + bonusXp, today };
        if (lesson.kind === "base" && !n.basesDone.includes(lesson.id)) n.basesDone = [...n.basesDone, lesson.id];
        if (lesson.kind === "sweep" && !n.sweepsDone.includes(lesson.id)) n.sweepsDone = [...n.sweepsDone, lesson.id];
        if (lesson.kind === "unit" && !n.unitsDone.includes(lesson.id)) n.unitsDone = [...n.unitsDone, lesson.id];
        if (lesson.kind === "numeral" && !n.numeralsDone.includes(lesson.id)) n.numeralsDone = [...n.numeralsDone, lesson.id];
        return n;
      });
      setLesson(null);
    };

    return (
      <div className="fd">
        {lesson.kind === "numeral" ? (
          <NumeralLesson spec={lesson} onExit={() => setLesson(null)} onDone={onLessonDone} />
        ) : (
          <Lesson
            spec={lesson}
            state={state}
            pool={pool}
            audio={audio}
            onExit={() => setLesson(null)}
            onDone={onLessonDone}
          />
        )}
      </div>
    );
  }

  return (
    <div className="fd">
      <div className="top" data-tour="topbar">
        <span className="mark">ፊ</span>
        <span className="chip">lv <b>{level}</b></span>
        <div className="xpbar"><div className="xpfill" style={{ width: `${pct}%` }} /></div>
        <span className="chip"><b>{state.xp}</b> xp</span>
        {!isStandalone() && (
          <button
            onClick={() => setShowInstallHelp(true)}
            title="How to save this app to your home screen"
            style={{
              display: "flex", alignItems: "center", gap: 3, color: "var(--gold)", fontSize: 11,
              fontWeight: 700, border: "1px solid var(--gold)", borderRadius: 999, padding: "4px 8px",
              flexShrink: 0, whiteSpace: "nowrap",
            }}
          >
            <span aria-hidden="true">⬇</span> Save
          </button>
        )}
        <button
          onClick={() => setShowTour(true)}
          title="Show the tour again"
          style={{ color: "var(--dim)", fontSize: 13, fontWeight: 700, width: 22, height: 22, borderRadius: "50%", border: "1px solid var(--line)", flexShrink: 0 }}
        >
          ?
        </button>
      </div>

      {saveFailed && (
        <div className="wrap" style={{ paddingTop: 10 }}>
          <div className="row-sp card" style={{ borderColor: "var(--rubric)", padding: "10px 14px" }}>
            <span className="note" style={{ color: "var(--rubric)", fontSize: 12 }}>
              Couldn't save just now — your device may be low on storage. Progress from this session
              may not stick if you close the app.
            </span>
            <button onClick={() => setSaveFailed(false)} style={{ color: "var(--dim)", fontSize: 16, padding: "0 0 0 10px" }}>✕</button>
          </div>
        </div>
      )}

      <div className="grow" style={{ display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {tab === "learn" && (
          <Home
            state={state}
            level={level}
            known={known}
            dueCount={due.length}
            track={track}
            setTrack={setTrack}
            onStart={(spec) => setLesson(spec)}
            onSpeed={() => setTab("speed")}
            onReview={() => setLesson({ kind: "review", id: "rev", fams: [], orders: [], doneLabel: "Review done" })}
            seenIntro={state.seenIntro}
            onSeen={markSeen}
            audioCount={haveAudio.size}
          />
        )}
        {tab === "chart" && (
          <Chart
            cards={state.cards}
            unlockedFams={unlockedFams}
            audio={audio}
            seenIntro={state.seenIntro}
            onSeen={markSeen}
          />
        )}
        {tab === "more" && (
          <More
            cards={state.cards}
            audio={audio}
            level={level}
            xp={state.xp}
            streakDays={state.streakDays}
            onReset={resetAll}
          />
        )}
        {tab === "words" && (
          <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
            <div className="wrap" style={{ paddingTop: 12 }}>
              <div style={{ display: "flex", gap: 6, background: "var(--ink2)", padding: 4, borderRadius: 12, border: "1px solid var(--line)" }}>
                {[["read", "Read sentences"], ["build", "Spell words"]].map(([id, label]) => (
                  <button key={id} onClick={() => setWordTab(id)} style={{
                    flex: 1, padding: "8px 6px", borderRadius: 9, fontSize: 12.5, fontWeight: 600,
                    background: wordTab === id ? "var(--rubric)" : "transparent",
                    color: wordTab === id ? "#fff" : "var(--dim)",
                  }}>{label}</button>
                ))}
              </div>
            </div>
            {wordTab === "read" ? (
              <Reader known={known} audio={audio} />
            ) : (
              <WordBuild pool={pool} unlockedChars={known} onXp={addXp} />
            )}
          </div>
        )}
        {tab === "write" && (
          <Trace
            letters={
              pool.length
                ? pool
                    .slice()
                    .sort((a, b) => a.fam - b.fam || a.order - b.order)
                    .map((p) => FAMS[p.fam].chars[p.order])
                : []
            }
            onXp={addXp}
          />
        )}
        {tab === "speed" &&
          (pool.length < 6 ? (
            <div className="wrap" style={{ paddingTop: 50, textAlign: "center" }}>
              <p className="note">Finish one lesson first. The speed round needs a pool to draw from.</p>
              <button className="btn ghost" style={{ maxWidth: 200, margin: "20px auto 0" }} onClick={() => setTab("learn")}>Back</button>
            </div>
          ) : (
            <div className="grow">
              <div className="wrap" style={{ paddingTop: 10 }}>
                <button className="speaker" onClick={() => setTab("learn")}>← back</button>
              </div>
              <Speed
                pool={pool}
                best={state.bestSpeed}
                onEnd={(sc) => setState((s) => {
                  const { today, bonusXp } = bumpToday(s, { xp: sc * 5, speedPlayed: 1 });
                  return { ...s, xp: s.xp + sc * 5 + bonusXp, bestSpeed: Math.max(s.bestSpeed, sc), today };
                })}
              />
            </div>
          ))}
      </div>

      <div className="tabs" data-tour="tabs">
        {[["learn", "ት", "learn"], ["chart", "ፊ", "chart"], ["more", "ተ", "more"], ["words", "ቃ", "read"], ["write", "ጽ", "write"]].map(
          ([id, g, label]) => (
            <button key={id} className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>
              <span className="tg">{g}</span>
              <span className="tl">{label}</span>
            </button>
          )
        )}
      </div>

      {showTour && (
        <Spotlight
          onDone={() => {
            setShowTour(false);
            markSeen("app-tour");
          }}
        />
      )}

      {showInstallHelp && (
        <InstallHelp
          onClose={() => {
            setShowInstallHelp(false);
            markSeen("cb-install");
          }}
        />
      )}
    </div>
  );
}
