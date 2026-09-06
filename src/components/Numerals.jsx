import { useState, useRef, useCallback } from "react";
import { GEEZ_NUM } from "../content.js";
import { pick, shuffle } from "../state.js";
import { WORD_FAM } from "../audio.js";

/* ============================================================
   STAGE THREE — GE'EZ NUMERALS
   A separate, lightweight engine rather than reusing Lesson.jsx:
   numerals have no families/orders/marks/articulation, so most of
   that engine's machinery doesn't apply. Mastery still lands in
   the same state.cards store, under WORD_FAM.numeral as the "fam"
   half of the (fam, order) key GEEZ_NUM's own index fills in for
   "order" — App.jsx's grade() is already generic over any such
   pair, so no changes were needed there to make this count as
   real spaced-repetition-tracked progress. It's kept off the
   letter pool/due queue on purpose: Speed/Trace/WordBuild all
   assume FAMS[fam] exists, and numerals aren't part of the
   six-month letter curriculum Plan paces out.
   ============================================================ */

const KINDS = ["glyph2reading", "glyph2value", "reading2glyph", "value2glyph"];

function makeNumQ(idx) {
  const [g, v, r] = GEEZ_NUM[idx];
  const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
  const others = GEEZ_NUM.filter((_, i) => i !== idx);

  if (kind === "glyph2reading") {
    const wrongs = pick(others, 3).map((e) => e[2]);
    return {
      kind, idx,
      stage: { type: "glyph", value: g },
      ask: "Which reading is this?",
      correct: r,
      options: shuffle([r, ...wrongs]),
      optionsGz: false,
      why: `${g} = ${r} (${v}).`,
    };
  }
  if (kind === "glyph2value") {
    const wrongs = pick(others, 3).map((e) => String(e[1]));
    return {
      kind, idx,
      stage: { type: "glyph", value: g },
      ask: "Which number is this?",
      correct: String(v),
      options: shuffle([String(v), ...wrongs]),
      optionsGz: false,
      why: `${g} = ${v} (${r}).`,
    };
  }
  if (kind === "reading2glyph") {
    const wrongs = pick(others, 3).map((e) => e[0]);
    return {
      kind, idx,
      stage: { type: "text", value: r },
      ask: "Which glyph says this?",
      correct: g,
      options: shuffle([g, ...wrongs]),
      optionsGz: true,
      why: `${r} = ${g} (${v}).`,
    };
  }
  // value2glyph
  const wrongs = pick(others, 3).map((e) => e[0]);
  return {
    kind, idx,
    stage: { type: "text", value: String(v) },
    ask: "Which glyph is this number?",
    correct: g,
    options: shuffle([g, ...wrongs]),
    optionsGz: true,
    why: `${v} = ${g} (${r}).`,
  };
}

function buildNumSession(indices) {
  const q = [];
  indices.forEach((idx) => {
    q.push(makeNumQ(idx));
    q.push(makeNumQ(idx));
  });
  return shuffle(q);
}

function NumeralOverview({ batch, onNext, onBack }) {
  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 18 }}>
        <div className="row-sp">
          <span className="eyebrow">Stage three · numerals</span>
          <button onClick={onBack} style={{ color: "var(--dim)", fontSize: 18 }}>✕</button>
        </div>
        <div className="disp" style={{ fontSize: 26, margin: "6px 0 2px" }}>{batch.blurb}</div>
        <p className="note" style={{ marginTop: 4 }}>
          No vowel marks here — matching glyph, value, and reading is the whole job.
        </p>
        {batch.indices.map((idx) => {
          const [g, v, r] = GEEZ_NUM[idx];
          return (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 0", borderTop: "1px solid var(--line)" }}>
              <span className="gz" style={{ fontSize: 30, width: 42, textAlign: "center" }}>{g}</span>
              <span style={{ width: 48, fontWeight: 600, fontSize: 15 }}>{v}</span>
              <span className="note" style={{ flex: 1, fontSize: 12.5 }}>{r}</span>
            </div>
          );
        })}
      </div>
      <div className="verdict">
        <button className="btn" onClick={onNext}>Start drilling</button>
      </div>
    </div>
  );
}

export function NumeralLesson({ spec, onDone, onExit }) {
  const { indices } = spec;
  const [phase, setPhase] = useState("intro");
  const [qi, setQi] = useState(0);
  const [queue, setQueue] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [got, setGot] = useState(0);
  const [missed, setMissed] = useState(0);
  const [combo, setCombo] = useState(0);
  const results = useRef([]);

  const startDrills = useCallback(() => {
    setQueue(buildNumSession(indices));
    setPhase("drill");
  }, []);

  if (phase === "intro") {
    return <NumeralOverview batch={spec} onNext={startDrills} onBack={onExit} />;
  }

  if (phase === "done") {
    const acc = Math.round((got / Math.max(1, got + missed)) * 100);
    const badge = GEEZ_NUM[indices[0]][0];
    return (
      <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
        <div className="wrap" style={{ paddingTop: 40, textAlign: "center" }}>
          <div className="gz" style={{ fontSize: 62, color: "var(--gold)" }}>{badge}</div>
          <div className="disp" style={{ fontSize: 30, marginTop: 10 }}>{spec.doneLabel}</div>
          <div className="row-sp" style={{ marginTop: 26 }}>
            <div className="stat"><b>{got * 10}</b><span>xp</span></div>
            <div className="stat"><b>{acc}%</b><span>accuracy</span></div>
            <div className="stat"><b>{indices.length}</b><span>numerals</span></div>
          </div>
        </div>
        <div className="verdict">
          <button className="btn" onClick={() => onDone(results.current, got * 10)}>Done</button>
        </div>
      </div>
    );
  }

  const q = queue[qi];
  if (!q)
    return (
      <div className="wrap" style={{ paddingTop: 60, textAlign: "center" }}>
        <span className="gz" style={{ fontSize: 34, color: "var(--rubric)" }}>ፊ</span>
      </div>
    );

  const answered = chosen !== null;
  const right = answered && chosen === q.correct;

  const answer = (opt) => {
    if (answered) return;
    setChosen(opt);
    const ok = opt === q.correct;
    results.current.push({ fam: WORD_FAM.numeral, order: q.idx, ok });
    if (ok) {
      setGot(got + 1);
      setCombo(combo + 1);
    } else {
      setMissed(missed + 1);
      setCombo(0);
      const again = makeNumQ(q.idx);
      const nq = queue.slice();
      nq.splice(Math.min(qi + 3, nq.length), 0, again);
      setQueue(nq);
    }
  };

  const next = () => {
    setChosen(null);
    if (qi + 1 >= queue.length) setPhase("done");
    else setQi(qi + 1);
  };

  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
          <button onClick={onExit} style={{ color: "var(--dim)", fontSize: 20, lineHeight: 1 }}>✕</button>
          <div className="xpbar">
            <div className="xpfill" style={{ width: `${(qi / queue.length) * 100}%` }} />
          </div>
          <span className="chip"><b>{qi + 1}</b>/{queue.length}</span>
          {combo >= 2 && <span className="combo" key={combo}>🔥 {combo}</span>}
        </div>

        <div style={{ height: 78 }} />

        <div className="stage">
          {q.stage.type === "glyph" ? (
            <span className={"glyph" + (answered ? (right ? " set" : " miss") : "")}>{q.stage.value}</span>
          ) : (
            <div className="prompt-rom">{q.stage.value}</div>
          )}
        </div>

        <div className="ask">{q.ask}</div>

        <div className="grid2">
          {q.options.map((o) => {
            let cls = "opt";
            if (q.optionsGz) cls += " gz";
            if (answered) {
              if (o === q.correct) cls += " right";
              else if (o === chosen) cls += " wrong";
              else cls += " fade";
            }
            return (
              <button key={o} className={cls} disabled={answered} onClick={() => answer(o)}>{o}</button>
            );
          })}
        </div>
      </div>

      {answered ? (
        <div className={"verdict " + (right ? "ok" : "no")}>
          <div className="vtitle" style={{ color: right ? "var(--verd)" : "var(--rubric)" }}>
            {right ? "Correct" : "Not this one"}
          </div>
          <div className="vsub" style={{ marginBottom: 12 }}>{q.why}</div>
          <button className="btn" onClick={next}>Continue</button>
        </div>
      ) : (
        <div className="verdict">
          <div className="vsub">Tap the one that matches.</div>
        </div>
      )}
    </div>
  );
}
