import { useState, useRef, useCallback, useEffect } from "react";
import { FAMS, ORDERS, CHAR_MAP, MARKS, ANCHORS, ARTIC } from "../content.js";
import { key, pick, shuffle } from "../state.js";
import { WORD_FAM } from "../audio.js";
import { Voice, Chant } from "./AudioWidgets.jsx";

function RubricRow({ fam, active, cards }) {
  return (
    <div>
      <div className="rubric">
        {fam.chars.map((c, i) => {
          const lv = (cards[key(fam.id, i)] || {}).lvl || 0;
          return (
            <div key={i} className={"rcell" + (i === active ? " on" : lv > 0 ? " known" : "")}>
              {c}
            </div>
          );
        })}
      </div>
      <div className="rord">{active != null ? `${ORDERS[active].am} · order ${active + 1}` : " "}</div>
    </div>
  );
}

/* ============================================================
   QUESTION ENGINE
   ============================================================ */

export const ALL = FAMS.flatMap((f) => f.chars.map((_, o) => ({ fam: f.id, order: o })));

const famOf = (ch) => (CHAR_MAP[ch] ? CHAR_MAP[ch].fam : -1);
const usesFam = (word, f) => Array.from(word).some((c) => famOf(c) === f);

function makeQ(target, pool, kinds) {
  const { fam, order } = target;
  const F = FAMS[fam];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const src = pool.length > 6 ? pool : ALL;

  if (kind === "orderName") {
    const wrong = pick(ORDERS.filter((o, i) => i !== order), 3);
    return {
      kind: "orderName", fam, order,
      ask: "የትኛው ደረጃ ነው?",
      askSub: "Which order is it standing in?",
      correct: ORDERS[order].am,
      options: shuffle([ORDERS[order].am, ...wrong.map((o) => o.am)]),
      gz: false,
      why: `${F.chars[order]} — ${ORDERS[order].am}, order ${order + 1}. ${MARKS[order] || ""}`,
    };
  }

  if (kind === "match") {
    const others = FAMS.filter((f) => f.id !== fam);
    const same = pick(others, 1)[0];
    const wrongs = pick(others.filter((f) => f.id !== same.id), 3).map((f) => {
      const o = pick([0, 1, 2, 3, 4, 5, 6].filter((x) => x !== order), 1)[0];
      return f.chars[o];
    });
    const correct = same.chars[order];
    return {
      kind: "match", fam, order,
      ask: "ተመሳሳይ ድምፅ",
      askSub: "Same vowel, different letter — which one?",
      correct,
      options: shuffle([correct, ...wrongs.filter((w) => w !== correct).slice(0, 3)]),
      gz: true,
      why: `Both ${F.chars[order]} and ${correct} sit in ${ORDERS[order].am}, order ${order + 1}.`,
    };
  }

  if (kind === "anchor" || kind === "anchor2") {
    const mine = ANCHORS[fam];
    if (mine && mine[0]) {
      const pool2 = FAMS.map((f) => ANCHORS[f.id])
        .filter((a, idx) => a && a[0] && idx !== fam && !usesFam(a[0], fam));
      const wrongs = pick(pool2, 3).map((a) => a[0]);
      if (wrongs.length === 3) {
        if (kind === "anchor") {
          return {
            kind: "anchor", fam, order: 0,
            ask: "የትኛው ቃል ይህን ፊደል ይይዛል?",
            askSub: "Which word uses this letter?",
            correct: mine[0],
            options: shuffle([mine[0], ...wrongs]),
            gz: true,
            why: `${mine[0]} — ${mine[2]}. It carries ${F.chars[0]}.`,
          };
        }
        const wf = pick(FAMS.filter((f) => f.id !== fam && !usesFam(mine[0], f.id)), 3);
        return {
          kind: "anchor2", fam, order: 0,
          word: mine[0],
          ask: "የትኛው ፊደል በዚህ ቃል ውስጥ አለ?",
          askSub: "Which letter is inside this word?",
          correct: F.chars[0],
          options: shuffle([F.chars[0], ...wf.map((f) => f.chars[0])]),
          gz: true,
          why: `${mine[0]} — ${mine[2]}. The letter is ${F.chars[0]}.`,
        };
      }
    }
    // no usable anchor: fall through to plain recognition
  }

  if (kind === "row") {
    const wrongOrders = pick([0, 1, 2, 3, 4, 5, 6].filter((o) => o !== order), 3);
    return {
      kind: "row", fam, order,
      ask: "Which letter fills the gap?",
      correct: F.chars[order],
      options: shuffle([F.chars[order], ...wrongOrders.map((o) => F.chars[o])]),
      gz: true,
      why: `${F.chars[order]} is order ${order + 1} (${ORDERS[order].am}) — ${ORDERS[order].hint}.`,
    };
  }

  if (kind === "transform") {
    const wrongOrders = pick([0, 1, 2, 3, 4, 5, 6].filter((o) => o !== order), 3);
    return {
      kind: "transform", fam, order,
      ask: `Put ${F.chars[0]} into ${ORDERS[order].am}`,
      correct: F.chars[order],
      options: shuffle([F.chars[order], ...wrongOrders.map((o) => F.chars[o])]),
      gz: true,
      why: `${F.chars[0]} → ${F.chars[order]}. ${MARKS[order] || ORDERS[order].hint}`,
    };
  }

  if (kind === "vowel") {
    const wrong = pick(ORDERS.filter((o, i) => i !== order), 3);
    return {
      kind: "vowel", fam, order,
      ask: "Which vowel is this carrying?",
      correct: ORDERS[order].v,
      options: shuffle([ORDERS[order].v, ...wrong.map((o) => o.v)]),
      gz: false,
      why: `${F.chars[order]} is ${F.chars[0]} plus the ${ORDERS[order].v} mark. ${MARKS[order] || ""}`,
    };
  }

  const sameFam = pool.filter((p) => p.fam === fam && p.order !== order);
  const sameOrd = pool.filter((p) => p.order === order && p.fam !== fam);
  const rest = pool.filter((p) => p.fam !== fam && p.order !== order);
  const cands = [...pick(sameFam, 1), ...pick(sameOrd, 2), ...pick(rest, 3)];

  if (kind === "f2r") {
    const correct = F.rom[order];
    const opts = [correct];
    for (const c of cands) {
      const r = FAMS[c.fam].rom[c.order];
      if (!opts.includes(r) && opts.length < 4) opts.push(r);
    }
    let g = 0;
    while (opts.length < 4 && g++ < 300) {
      const p = src[Math.floor(Math.random() * src.length)];
      const r = FAMS[p.fam].rom[p.order];
      if (!opts.includes(r)) opts.push(r);
    }
    return {
      kind: "f2r", fam, order,
      ask: "Which sound is this?",
      correct,
      options: shuffle(opts),
      gz: false,
      why:
        order === 0
          ? `${F.chars[0]} = ${correct}.${F.note ? " " + F.note : ""}`
          : `${F.chars[order]} = ${correct}. Base is ${F.chars[0]} (${F.rom[0]}) plus the ${ORDERS[order].v} mark.`,
    };
  }

  // r2f — never offer a homophone as a wrong answer
  const correctRom = F.rom[order];
  const correct = F.chars[order];
  const opts = [correct];
  for (const c of cands) {
    const ch = FAMS[c.fam].chars[c.order];
    if (FAMS[c.fam].rom[c.order] === correctRom) continue;
    if (!opts.includes(ch) && opts.length < 4) opts.push(ch);
  }
  let g2 = 0;
  while (opts.length < 4 && g2++ < 300) {
    const p = src[Math.floor(Math.random() * src.length)];
    const ch = FAMS[p.fam].chars[p.order];
    if (FAMS[p.fam].rom[p.order] !== correctRom && !opts.includes(ch)) opts.push(ch);
  }
  return {
    kind: "r2f", fam, order,
    ask: `Which letter says "${correctRom}"?`,
    correct,
    options: shuffle(opts),
    gz: true,
    why:
      order === 0
        ? `${correct} = ${correctRom}.`
        : `${correct} = ${correctRom}. ${MARKS[order] || ORDERS[order].hint}`,
  };
}

const KINDS = {
  base: ["f2r", "r2f", "f2r"],
  sweep: ["transform", "vowel", "f2r", "r2f"],
  unit: ["f2r", "r2f", "row"],
};

const kindsFor = (lessonKind) => KINDS[lessonKind] || KINDS.unit;

function buildSession(targets, pool, reviews, kinds) {
  const q = [];
  targets.forEach((t) => {
    q.push(makeQ(t, pool, kinds));
    q.push(makeQ(t, pool, kinds));
  });
  pick(reviews, targets.length ? 4 : 18).forEach((r) =>
    q.push(makeQ(r, pool, kindsFor("unit")))
  );
  return shuffle(q).slice(0, 18);
}

/* ============================================================
   LESSON — one engine, three shapes of curriculum
   ============================================================ */

function BaseIntro({ fams, i, audio, onNext, onBack }) {
  const F = FAMS[fams[i]];
  const A = ANCHORS[F.id];
  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 18 }}>
        <div className="row-sp">
          <span className="eyebrow">Base letter {i + 1} of {fams.length}</span>
          <button onClick={onBack} style={{ color: "var(--dim)", fontSize: 18 }}>✕</button>
        </div>

        <div style={{ textAlign: "center", margin: "34px 0 10px" }}>
          <span className="gz" style={{ fontSize: 128, color: "var(--rubric)", lineHeight: 1 }}>
            {F.chars[0]}
          </span>
        </div>
        <div className="disp" style={{ fontSize: 40, textAlign: "center" }}>{F.rom[0]}</div>
        <div className="note" style={{ textAlign: "center", marginTop: 2 }}>{ORDERS[0].say}</div>

        {ARTIC[F.id] && (
          <div className="card" style={{ marginTop: 16, borderColor: "var(--gold)" }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>How to make the sound</div>
            <div className="note" style={{ color: "var(--bone)", fontSize: 13 }}>{ARTIC[F.id]}</div>
          </div>
        )}

        {audio && (
          <div style={{ marginTop: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Your voice</div>
            <Voice fam={F.id} order={0} have={audio.have.has(`${F.id}.0`)} onSaved={audio.onSaved} />
          </div>
        )}

        <div className="rule" />

        {A && A[0] ? (
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Where you'll meet it</div>
            <div className="gz" style={{ fontSize: 34 }}>{A[0]}</div>
            <div className="note"><b style={{ color: "var(--bone)" }}>{A[1]}</b> — {A[2]}</div>
            {audio && (
              <div style={{ marginTop: 10 }}>
                <Voice
                  fam={WORD_FAM.anchor}
                  order={F.id}
                  have={audio.have.has(`${WORD_FAM.anchor}.${F.id}`)}
                  onSaved={audio.onSaved}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="note">{A ? A[2] : ""}</div>
        )}

        {F.note && (
          <div className="note" style={{ marginTop: 14, color: "var(--gold)" }}>{F.note}</div>
        )}

        <div className="rule" />
        <div className="eyebrow" style={{ marginBottom: 2 }}>The row it belongs to</div>
        <p className="note" style={{ fontSize: 11.5, marginBottom: 4 }}>
          You already have this rhythm. Chant it once so the shape gets filed under a sound you know.
          The six marks come later.
        </p>
        <Chant fam={F.id} compact />
      </div>
      <div className="verdict">
        <button className="btn" onClick={onNext}>
          {i === fams.length - 1 ? "Start drilling" : "Next letter"}
        </button>
      </div>
    </div>
  );
}

function SweepIntro({ order, onNext, onBack }) {
  const demo = [0, 1, 5, 7].map((f) => FAMS[f]);
  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 18 }}>
        <div className="row-sp">
          <span className="eyebrow">{ORDERS[order].am} · order {order + 1}</span>
          <button onClick={onBack} style={{ color: "var(--dim)", fontSize: 18 }}>✕</button>
        </div>

        <div className="disp" style={{ fontSize: 34, margin: "8px 0 2px" }}>
          The <span style={{ color: "var(--rubric)" }}>{ORDERS[order].v}</span> mark
        </div>
        <div className="note" style={{ marginBottom: 18 }}>
          Sounds {ORDERS[order].say}. Same change, every letter.
        </div>

        <div className="card" style={{ borderColor: "var(--rubric)" }}>
          <div className="note" style={{ color: "var(--bone)", fontSize: 13.5 }}>{MARKS[order]}</div>
        </div>

        <div className="eyebrow" style={{ margin: "18px 0 4px" }}>Watch it happen</div>
        {demo.map((F) => (
          <div
            key={F.id}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)" }}
          >
            <span className="gz" style={{ fontSize: 32, color: "var(--dim)", width: 44, textAlign: "center" }}>{F.chars[0]}</span>
            <span style={{ color: "var(--dim)", fontSize: 15 }}>→</span>
            <span className="gz" style={{ fontSize: 32, color: "var(--rubric)", width: 44, textAlign: "center" }}>{F.chars[order]}</span>
            <span className="note" style={{ flex: 1 }}>
              {F.rom[0]} → <b style={{ color: "var(--bone)" }}>{F.rom[order]}</b>
            </span>
          </div>
        ))}

        {order === 5 && (
          <div className="note" style={{ marginTop: 16, color: "var(--gold)" }}>
            Fair warning: this column breaks its own rule more than any other. Treat these as 34 small
            shapes to memorize rather than one mark to apply.
          </div>
        )}
      </div>
      <div className="verdict">
        <button className="btn" onClick={onNext}>Start drilling</button>
      </div>
    </div>
  );
}

function FamilyIntro({ fams, i, onNext, onBack }) {
  const F = FAMS[fams[i]];
  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 18 }}>
        <div className="row-sp">
          <span className="eyebrow">New row {i + 1} of {fams.length}</span>
          <button onClick={onBack} style={{ color: "var(--dim)", fontSize: 18 }}>✕</button>
        </div>
        <div className="disp" style={{ fontSize: 26, margin: "6px 0 2px" }}>
          The <span style={{ color: "var(--rubric)" }}>{F.cons === "'" ? "vowel" : F.cons}</span> row
        </div>
        <p className="note" style={{ marginTop: 4 }}>
          {F.note || "One shape, seven vowels. Learn the shape once, then learn the seven marks."}
        </p>
        <div style={{ textAlign: "center", margin: "20px 0 18px" }}>
          <span className="gz" style={{ fontSize: 76, color: "var(--rubric)" }}>{F.chars[0]}</span>
        </div>
        {ORDERS.map((o, k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 0", borderTop: "1px solid var(--line)" }}>
            <span className="gz" style={{ fontSize: 30, width: 42, textAlign: "center" }}>{F.chars[k]}</span>
            <span style={{ width: 52, fontWeight: 600, fontSize: 15 }}>{F.rom[k]}</span>
            <span className="note" style={{ flex: 1, fontSize: 11.5 }}>{o.hint}</span>
          </div>
        ))}
      </div>
      <div className="verdict">
        <button className="btn" onClick={onNext}>
          {i === fams.length - 1 ? "Start drilling" : "Next row"}
        </button>
      </div>
    </div>
  );
}

export function Lesson({ spec, state, pool, audio, onDone, onExit }) {
  const { kind, fams, orders } = spec;
  const isReview = kind === "review";
  const needsIntro = !isReview && !spec.skipIntro;
  const bank = useRef(pool);
  const [phase, setPhase] = useState(needsIntro ? "intro" : "drill");
  const [introI, setIntroI] = useState(0);
  const [qi, setQi] = useState(0);
  const [queue, setQueue] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [got, setGot] = useState(0);
  const [missed, setMissed] = useState(0);
  const [combo, setCombo] = useState(0);
  const results = useRef([]);

  const qkinds = kindsFor(kind === "review" ? "unit" : kind);

  const startDrills = useCallback(() => {
    const targets = [];
    fams.forEach((f) => orders.forEach((o) => targets.push({ fam: f, order: o })));
    const reviews = pool.filter(
      (p) => !targets.some((t) => t.fam === p.fam && t.order === p.order)
    );
    const b = targets.length ? [...pool, ...targets] : pool;
    bank.current = b;
    setQueue(buildSession(pick(targets, 9), b, reviews, qkinds));
    setPhase("drill");
  }, []);

  useEffect(() => {
    if (!needsIntro) startDrills();
  }, []);

  if (phase === "intro") {
    const next = () => {
      const pages = kind === "sweep" ? 1 : fams.length;
      if (introI >= pages - 1) startDrills();
      else setIntroI(introI + 1);
    };
    if (kind === "sweep") return <SweepIntro order={orders[0]} onNext={next} onBack={onExit} />;
    if (kind === "base") return <BaseIntro fams={fams} i={introI} audio={audio} onNext={next} onBack={onExit} />;
    return <FamilyIntro fams={fams} i={introI} onNext={next} onBack={onExit} />;
  }

  if (phase === "done") {
    const acc = Math.round((got / Math.max(1, got + missed)) * 100);
    const badge =
      kind === "sweep" ? FAMS[3].chars[orders[0]] : kind === "review" ? "ደግ" : FAMS[fams[0]].chars[0];
    return (
      <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
        <div className="wrap" style={{ paddingTop: 40, textAlign: "center" }}>
          <div className="gz" style={{ fontSize: 62, color: "var(--gold)" }}>{badge}</div>
          <div className="disp" style={{ fontSize: 30, marginTop: 10 }}>{spec.doneLabel}</div>
          <div className="row-sp" style={{ marginTop: 26 }}>
            <div className="stat"><b>{got * 10}</b><span>xp</span></div>
            <div className="stat"><b>{acc}%</b><span>accuracy</span></div>
            <div className="stat"><b>{fams.length * orders.length || results.current.length}</b><span>letters</span></div>
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

  const F = FAMS[q.fam];
  const answered = chosen !== null;
  const right = answered && chosen === q.correct;

  const answer = (opt) => {
    if (answered) return;
    setChosen(opt);
    const ok = opt === q.correct;
    results.current.push({ fam: q.fam, order: q.order, ok });
    if (ok) {
      setGot(got + 1);
      setCombo(combo + 1);
    } else {
      setMissed(missed + 1);
      setCombo(0);
      const again = makeQ({ fam: q.fam, order: q.order }, bank.current, qkinds);
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

  const showRubric = answered;

  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
          <button onClick={onExit} style={{ color: "var(--dim)", fontSize: 20, lineHeight: 1 }}>✕</button>
          <div className="xpbar">
            <div className="xpfill" style={{ width: `${(qi / queue.length) * 100}%` }} />
          </div>
          <span className="chip"><b>{qi + 1}</b>/{queue.length}</span>
          {combo >= 2 && (
            <span className="combo" key={combo}>🔥 {combo}</span>
          )}
        </div>

        {showRubric ? (
          <RubricRow fam={F} active={q.order} cards={state.cards} />
        ) : (
          <div style={{ height: 78 }} />
        )}

        <div className="stage">
          {(q.kind === "f2r" || q.kind === "vowel" || q.kind === "orderName" || q.kind === "match" || q.kind === "anchor") && (
            <span className={"glyph" + (answered ? (right ? " set" : " miss") : "")}>
              {q.kind === "anchor" ? F.chars[0] : F.chars[q.order]}
            </span>
          )}
          {q.kind === "anchor2" && (
            <span className={"glyph" + (answered ? (right ? " set" : " miss") : "")} style={{ fontSize: 62 }}>
              {q.word}
            </span>
          )}
          {q.kind === "r2f" && <div className="prompt-rom">{F.rom[q.order]}</div>}
          {q.kind === "transform" && (
            <div style={{ padding: "16px 0 4px" }}>
              <span className="gz" style={{ fontSize: 76, color: "var(--dim)" }}>{F.chars[0]}</span>
              <span className="disp" style={{ fontSize: 34, margin: "0 14px", color: "var(--dim)" }}>+</span>
              <span className="disp" style={{ fontSize: 52, color: "var(--rubric)" }}>
                {ORDERS[q.order].v}
              </span>
            </div>
          )}
          {q.kind === "row" && (
            <div style={{ fontSize: 0, padding: "18px 0 6px" }}>
              {F.chars.map((c, i) => (
                <span key={i} className="gz" style={{
                  fontSize: 30, padding: "0 5px",
                  color: i === q.order ? "var(--rubric)" : "var(--dim)",
                  borderBottom: i === q.order ? "2px solid var(--rubric)" : "none",
                }}>
                  {i === q.order ? (answered && right ? c : "?") : c}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="ask">
          <span className={q.askSub ? "gz" : ""} style={q.askSub ? { fontSize: 19, color: "var(--bone)" } : undefined}>
            {q.ask}
          </span>
          {q.askSub && <div style={{ marginTop: 3 }}>{q.askSub}</div>}
        </div>

        <div className="grid2">
          {q.options.map((o) => {
            let cls = "opt";
            if (q.kind === "orderName") cls += " amh";
            else if (q.kind === "anchor") cls += " gzw";
            else if (q.gz) cls += " gz";
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
          <div className="vsub">
            {["vowel", "orderName", "match"].includes(q.kind)
              ? "Look at the right side of the letter. That's where the mark lives."
              : kind === "base"
              ? "Bare consonant — no vowel mark yet."
              : `Order ${q.order + 1} · ${ORDERS[q.order].say}`}
          </div>
        </div>
      )}
    </div>
  );
}
