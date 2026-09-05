import { useState, useRef, useCallback, useEffect } from "react";
import { CHAR_MAP, FAMS, ORDERS } from "../content.js";

/* ============================================================
   TRACE
   Tracing is scored by comparing what you drew against the
   glyph's own pixels on a coarse grid — coverage minus spill.
   It judges the shape you made, not the order you made it in.
   ============================================================ */

const PAD = 320;
const CELLS = 40;
const FIDEL_STACK = "'Noto Serif Ethiopic','Kefa','Noto Sans Ethiopic','Abyssinica SIL','Nyala',serif";

function maskFromChar(ch) {
  const c = document.createElement("canvas");
  c.width = PAD;
  c.height = PAD;
  const x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `210px ${FIDEL_STACK}`;
  x.fillText(ch, PAD / 2, PAD / 2 + 8);
  const d = x.getImageData(0, 0, PAD, PAD).data;
  const g = new Uint8Array(CELLS * CELLS);
  const step = PAD / CELLS;
  for (let py = 0; py < PAD; py++) {
    for (let px = 0; px < PAD; px++) {
      if (d[(py * PAD + px) * 4 + 3] > 60) {
        g[Math.floor(py / step) * CELLS + Math.floor(px / step)] = 1;
      }
    }
  }
  return g;
}

const INK_NEUTRAL = "#EDE3CE";

// Shared by Trace's live-drawing feedback and its final check() -- same
// coarse-grid coverage/spill math either way, just called at different
// times.
function coverageOf(ctx, mask) {
  const d = ctx.getImageData(0, 0, PAD, PAD).data;
  const step = PAD / CELLS;
  const u = new Uint8Array(CELLS * CELLS);
  for (let py = 0; py < PAD; py++) {
    for (let px = 0; px < PAD; px++) {
      if (d[(py * PAD + px) * 4 + 3] > 60) {
        u[Math.floor(py / step) * CELLS + Math.floor(px / step)] = 1;
      }
    }
  }
  let gTot = 0, uTot = 0, hit = 0;
  for (let k = 0; k < mask.length; k++) {
    if (mask[k]) gTot++;
    if (u[k]) uTot++;
    if (mask[k] && u[k]) hit++;
  }
  return { coverage: gTot ? hit / gTot : 0, spill: uTot ? (uTot - hit) / uTot : 1 };
}

function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function Trace({ letters, onXp }) {
  const ghostRef = useRef(null);
  const inkRef = useRef(null);
  const maskRef = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const [i, setI] = useState(0);
  const [mode, setMode] = useState("trace"); // trace | memory
  const [score, setScore] = useState(null);
  const [ready, setReady] = useState(false);

  const ch = letters[i % Math.max(1, letters.length)];
  const info = CHAR_MAP[ch];

  const paintGhost = useCallback(
    (visible) => {
      const c = ghostRef.current;
      if (!c) return;
      const x = c.getContext("2d");
      x.clearRect(0, 0, PAD, PAD);
      if (!visible) return;
      x.fillStyle = "rgba(237,227,206,0.16)";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.font = `210px ${FIDEL_STACK}`;
      x.fillText(ch, PAD / 2, PAD / 2 + 8);
    },
    [ch]
  );

  const clearInk = useCallback(() => {
    const c = inkRef.current;
    if (c) c.getContext("2d").clearRect(0, 0, PAD, PAD);
    dirty.current = false;
    setScore(null);
  }, []);

  useEffect(() => {
    let alive = true;
    const go = () => {
      if (!alive) return;
      maskRef.current = maskFromChar(ch);
      paintGhost(mode === "trace");
      clearInk();
      setReady(true);
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go);
    else go();
    return () => {
      alive = false;
    };
  }, [ch]);

  useEffect(() => {
    if (ready) paintGhost(mode === "trace" || score !== null);
  }, [mode, score, ready, paintGhost]);

  const pos = (e) => {
    const r = inkRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * PAD, ((e.clientY - r.top) / r.height) * PAD];
  };

  const moveCount = useRef(0);

  const down = (e) => {
    if (score !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    dirty.current = true;
    moveCount.current = 0;
    const x = inkRef.current.getContext("2d");
    const [a, b] = pos(e);
    x.strokeStyle = INK_NEUTRAL;
    x.lineWidth = 13;
    x.lineCap = "round";
    x.lineJoin = "round";
    x.beginPath();
    x.moveTo(a, b);
  };

  const move = (e) => {
    if (!drawing.current) return;
    const x = inkRef.current.getContext("2d");
    const [a, b] = pos(e);
    x.lineTo(a, b);
    x.stroke();

    // Live "getting warmer" feedback: every few points (getImageData isn't
    // free -- no need to run it on every single pointermove), recolor the
    // whole stroke toward --verd as coverage of the target shape improves.
    // stroke() re-renders the WHOLE accumulated path each call (no
    // beginPath() between segments), so changing strokeStyle here recolors
    // ink already drawn, not just what comes next.
    moveCount.current++;
    if (maskRef.current && moveCount.current % 4 === 0) {
      const { coverage } = coverageOf(x, maskRef.current);
      x.strokeStyle = lerpColor(INK_NEUTRAL, "#4F9A76", Math.min(1, coverage));
    }
  };

  const up = () => {
    drawing.current = false;
  };

  const check = () => {
    if (!dirty.current || !maskRef.current) return;
    const x = inkRef.current.getContext("2d");
    const { coverage, spill } = coverageOf(x, maskRef.current);
    const sc = Math.max(0, Math.round(100 * coverage * (1 - 0.5 * spill)));
    setScore({ sc, coverage: Math.round(coverage * 100), spill: Math.round(spill * 100) });
    if (sc >= 70) onXp(10);
  };

  const verdict = (sc) =>
    sc >= 85
      ? "Clean. That's the shape."
      : sc >= 70
      ? "Recognizable. Tighten the curves."
      : sc >= 45
      ? "The skeleton's there, but it's drifting off the form."
      : "Way off. Switch back to tracing and follow the ghost.";

  if (!letters.length) {
    return (
      <div className="wrap" style={{ paddingTop: 40, textAlign: "center" }}>
        <p className="note">Learn a letter first, then come back and write it.</p>
      </div>
    );
  }

  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 14 }}>
        <div style={{ display: "flex", gap: 6, background: "var(--ink2)", padding: 4, borderRadius: 12, border: "1px solid var(--line)", marginBottom: 14 }}>
          {[["trace", "Trace over it"], ["memory", "From memory"]].map(([id, label]) => (
            <button key={id} onClick={() => { setMode(id); clearInk(); }} style={{
              flex: 1, padding: "8px 6px", borderRadius: 9, fontSize: 12.5, fontWeight: 600,
              background: mode === id ? "var(--rubric)" : "transparent",
              color: mode === id ? "#fff" : "var(--dim)",
            }}>{label}</button>
          ))}
        </div>

        <div className="row-sp" style={{ marginBottom: 8 }}>
          <span className="eyebrow">
            {info ? `${FAMS[info.fam].rom[info.order]} · ${ORDERS[info.order].am}` : "write it"}
          </span>
          <span className="pill">{i + 1} of {letters.length}</span>
        </div>

        {mode === "memory" && score === null && (
          <div className="disp" style={{ fontSize: 40, textAlign: "center", marginBottom: 6 }}>
            {info ? FAMS[info.fam].rom[info.order] : ""}
          </div>
        )}

        <div className="padwrap">
          <div className="guide">
            <i style={{ left: "50%", top: 0, bottom: 0, width: 1 }} />
            <i style={{ top: "50%", left: 0, right: 0, height: 1 }} />
          </div>
          <canvas ref={ghostRef} width={PAD} height={PAD} />
          <canvas
            ref={inkRef}
            width={PAD}
            height={PAD}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>

        <p className="note" style={{ textAlign: "center", marginTop: 12, fontSize: 11.5 }}>
          Fidel is written left to right, and within a letter the uprights come before the strokes that
          join them. Nothing here checks your stroke order — it scores the shape you end up with.
        </p>
      </div>

      {score ? (
        <div className={"verdict " + (score.sc >= 70 ? "ok" : "no")}>
          <div className="row-sp" style={{ marginBottom: 8 }}>
            <div>
              <div className="vtitle" style={{ color: score.sc >= 70 ? "var(--verd)" : "var(--rubric)" }}>
                {score.sc}
              </div>
              <div className="vsub">{verdict(score.sc)}</div>
            </div>
            <span className="gz" style={{ fontSize: 44, color: "var(--dim)" }}>{ch}</span>
          </div>
          <div className="vsub" style={{ marginBottom: 10, fontSize: 11.5 }}>
            {score.coverage}% of the letter covered · {score.spill}% of your ink landed outside it
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" style={{ flex: 1 }} onClick={clearInk}>Again</button>
            <button className="btn" style={{ flex: 2 }} onClick={() => { setI(i + 1); }}>Next letter</button>
          </div>
        </div>
      ) : (
        <div className="verdict">
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" style={{ flex: 1 }} onClick={clearInk}>Clear</button>
            <button className="btn" style={{ flex: 2 }} onClick={check}>Check it</button>
          </div>
        </div>
      )}
    </div>
  );
}
