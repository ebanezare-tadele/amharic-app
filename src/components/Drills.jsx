import { useState, useMemo, useEffect, useCallback } from "react";
import { FAMS, CHAR_MAP } from "../content.js";
import { wordsFor, pick, shuffle } from "../state.js";
import { ALL } from "./Lesson.jsx";
import { Voice } from "./AudioWidgets.jsx";

/* ============================================================
   WORD BUILDER
   ============================================================ */

export function WordBuild({ pool, unlockedChars, onXp }) {
  const bank = useMemo(() => wordsFor(unlockedChars), [unlockedChars]);
  const [i, setI] = useState(0);
  const [slots, setSlots] = useState([]);
  const [used, setUsed] = useState([]);
  const [state, setState] = useState("go");

  const w = bank[i % Math.max(1, bank.length)];

  const tiles = useMemo(() => {
    if (!w) return [];
    const need = Array.from(w[0]);
    const decoys = pick(pool, 3)
      .map((p) => FAMS[p.fam].chars[p.order])
      .filter((c) => !need.includes(c))
      .slice(0, 2);
    return shuffle([...need, ...decoys]);
  }, [w, i]);

  useEffect(() => {
    setSlots([]);
    setUsed([]);
    setState("go");
  }, [i]);

  if (!w) {
    return (
      <div className="wrap" style={{ paddingTop: 40, textAlign: "center" }}>
        <div className="gz" style={{ fontSize: 46, color: "var(--dim)" }}>፨</div>
        <p className="note" style={{ marginTop: 12 }}>
          No readable words yet. Finish unit 1 and a few will unlock — you can only be given words made
          entirely of letters you've met.
        </p>
      </div>
    );
  }

  const target = Array.from(w[0]);

  const tapTile = (idx) => {
    if (state !== "go" || slots.length >= target.length) return;
    const ns = [...slots, tiles[idx]];
    const nu = [...used, idx];
    setSlots(ns);
    setUsed(nu);
    if (ns.length === target.length) {
      const ok = ns.join("") === w[0];
      setState(ok ? "won" : "lost");
      if (ok) onXp(15);
    }
  };

  const undo = () => {
    if (state !== "go") return;
    setSlots(slots.slice(0, -1));
    setUsed(used.slice(0, -1));
  };

  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 20 }}>
        <div className="eyebrow">Spell it out</div>
        <div className="disp" style={{ fontSize: 34, margin: "4px 0 2px" }}>
          {w[2]}
        </div>
        <div className="note" style={{ marginBottom: 24 }}>
          sounds like <b style={{ color: "var(--bone)" }}>{w[1]}</b> · {target.length} letters
        </div>

        <div style={{ textAlign: "center", minHeight: 60, marginBottom: 26 }}>
          {target.map((_, n) => (
            <span key={n} className={"slot" + (slots[n] ? " filled" : "")}>
              {slots[n] || ""}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "center" }}>
          {tiles.map((t, idx) => (
            <button
              key={idx}
              className={"tile" + (used.includes(idx) ? " used" : "")}
              disabled={used.includes(idx) || state !== "go"}
              onClick={() => tapTile(idx)}
            >
              {t}
            </button>
          ))}
        </div>

        {state === "go" && slots.length > 0 && (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button className="speaker" onClick={undo}>
              ← undo
            </button>
          </div>
        )}
      </div>

      {state !== "go" && (
        <div className={"verdict " + (state === "won" ? "ok" : "no")}>
          <div className="vtitle" style={{ color: state === "won" ? "var(--verd)" : "var(--rubric)" }}>
            {state === "won" ? "That's it" : "Not quite"}
          </div>
          <div className="vsub" style={{ marginBottom: 12 }}>
            <span className="gz" style={{ fontSize: 22 }}>{w[0]}</span>
            {` · ${w[1]} · ` +
              target.map((c) => (CHAR_MAP[c] ? FAMS[CHAR_MAP[c].fam].rom[CHAR_MAP[c].order] : c)).join(" · ")}
          </div>
          <button className="btn" onClick={() => setI(i + 1)}>
            Next word
          </button>
        </div>
      )}
      {state === "go" && (
        <div className="verdict">
          <div className="vsub">Tap the letters in order, left to right.</div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SPEED ROUND
   ============================================================ */

export function Speed({ pool, best, onEnd }) {
  const [t, setT] = useState(60);
  const [score, setScore] = useState(0);
  const [q, setQ] = useState(null);
  const [flash, setFlash] = useState(null);
  const [running, setRunning] = useState(false);

  const roll = useCallback(() => {
    const tgt = pool[Math.floor(Math.random() * pool.length)];
    const rom = FAMS[tgt.fam].rom[tgt.order];
    const opts = [FAMS[tgt.fam].chars[tgt.order]];
    let guard = 0;
    while (opts.length < 6 && guard++ < 200) {
      const p = pool[Math.floor(Math.random() * pool.length)];
      const ch = FAMS[p.fam].chars[p.order];
      if (FAMS[p.fam].rom[p.order] !== rom && !opts.includes(ch)) opts.push(ch);
    }
    // a thin pool (or one full of homophones) can't fill six — top up from the full fidel
    let guard2 = 0;
    while (opts.length < 6 && guard2++ < 400) {
      const p = ALL[Math.floor(Math.random() * ALL.length)];
      const ch = FAMS[p.fam].chars[p.order];
      if (FAMS[p.fam].rom[p.order] !== rom && !opts.includes(ch)) opts.push(ch);
    }
    setQ({ rom, correct: opts[0], options: shuffle(opts) });
  }, [pool]);

  useEffect(() => {
    if (!running) return;
    if (t <= 0) {
      setRunning(false);
      onEnd(score);
      return;
    }
    const id = setTimeout(() => setT(t - 1), 1000);
    return () => clearTimeout(id);
  }, [t, running]);

  if (!running && t === 60) {
    return (
      <div className="wrap" style={{ paddingTop: 50, textAlign: "center" }}>
        <div className="eyebrow">Sixty seconds</div>
        <div className="disp" style={{ fontSize: 38, margin: "8px 0 10px" }}>
          Speed round
        </div>
        <p className="note" style={{ maxWidth: 300, margin: "0 auto 6px" }}>
          A sound appears. Tap its letter. No hints, no second chances — this is the drill that turns
          recognition into reflex.
        </p>
        <p className="note" style={{ marginBottom: 28 }}>
          Best so far: <b style={{ color: "var(--gold)" }}>{best}</b>
        </p>
        <button
          className="btn rub"
          style={{ maxWidth: 260, margin: "0 auto" }}
          onClick={() => {
            roll();
            setRunning(true);
          }}
        >
          Begin
        </button>
      </div>
    );
  }

  if (!running) {
    return (
      <div className="wrap" style={{ paddingTop: 60, textAlign: "center" }}>
        <div className="disp" style={{ fontSize: 72, color: "var(--gold)" }}>{score}</div>
        <div className="eyebrow">letters in sixty seconds</div>
        <p className="note" style={{ marginTop: 16 }}>
          {score > best ? "New best." : `Best is ${best}.`}
        </p>
        <button
          className="btn ghost"
          style={{ maxWidth: 240, margin: "26px auto 0" }}
          onClick={() => {
            setT(60);
            setScore(0);
            roll();
            setRunning(true);
          }}
        >
          Run it again
        </button>
      </div>
    );
  }

  const hit = (c) => {
    if (c === q.correct) {
      setScore(score + 1);
      setFlash("ok");
    } else {
      setScore(Math.max(0, score - 1));
      setFlash("no");
    }
    setTimeout(() => setFlash(null), 160);
    roll();
  };

  return (
    <div className="wrap" style={{ paddingTop: 16 }}>
      <div className="row-sp">
        <span className="chip">
          score <b>{score}</b>
        </span>
        <span
          className="chip"
          style={{ color: t <= 10 ? "var(--rubric)" : undefined, fontSize: 15 }}
        >
          <b>{t}s</b>
        </span>
      </div>
      <div className="xpbar" style={{ marginTop: 10 }}>
        <div className="xpfill" style={{ width: `${(t / 60) * 100}%`, background: "var(--rubric)" }} />
      </div>

      <div
        className="prompt-rom"
        style={{
          textAlign: "center",
          margin: "34px 0",
          color: flash === "ok" ? "var(--verd)" : flash === "no" ? "var(--rubric)" : "var(--bone)",
        }}
      >
        {q.rom}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
        {q.options.map((c) => (
          <button key={c} className="opt gz" onClick={() => hit(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   WORD ENTRY
   One anchor word or phrase, with the same way to record one
   (Voice) that letters get — filed under a pseudo-family id
   (WORD_FAM) in the same addressing letters use.
   ============================================================ */

export function WordEntry({ text, rom, gloss, fam, order, audio }) {
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
      <div className="gz" style={{ fontSize: 24 }}>{text}</div>
      <div className="note">
        <b style={{ color: "var(--bone)" }}>{rom}</b> — {gloss}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        {audio && (
          <Voice
            fam={fam}
            order={order}
            have={audio.have.has(`${fam}.${order}`)}
            onSaved={audio.onSaved}
          />
        )}
      </div>
    </div>
  );
}
