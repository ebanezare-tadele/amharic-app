import { useState } from "react";
import { ORDERS, FAMS, ARTIC } from "../content.js";
import { key } from "../state.js";
import { WORD_FAM } from "../audio.js";
import { Chant, Voice, HearButton } from "./AudioWidgets.jsx";
import { Callout } from "./Callout.jsx";

/* ============================================================
   CHART
   Deliberately just the grid + per-letter detail now -- numerals,
   punctuation, the script's history, anchor words/phrases, sync, and
   reset all used to live below this on the same screen, easy to miss
   under a tab literally called "chart" (a real complaint: someone
   who never scrolled past the grid had no idea any of it existed).
   See components/More.jsx for all of that.
   ============================================================ */

export function Chart({ cards, unlockedFams, audio, seenIntro, onSeen }) {
  const [sel, setSel] = useState(null);
  // audio.have covers letters and, now, words (WORD_FAM) in the same
  // set — filtered here so the "record the sounds yourself" card still
  // counts letters specifically, not words recorded further down.
  const letterAudioCount = audio
    ? [...audio.have].filter((k) => Number(k.split(".")[0]) < WORD_FAM.anchor).length
    : 0;
  return (
    <div className="wrap" style={{ paddingTop: 18, paddingBottom: 30 }}>
      <div className="eyebrow">The whole system</div>
      <div className="disp" style={{ fontSize: 30, margin: "4px 0 6px" }}>
        ፊደል
      </div>
      <p className="note" style={{ marginBottom: 14 }}>
        Read across, not down. Every row is one consonant wearing seven vowels. Brightness shows how well
        you know each letter.
      </p>

      {audio && (
        <div className="note" style={{ marginBottom: 14, fontSize: 11.5 }}>
          Tap any letter (or an anchor word/phrase further down) to record your own or a relative's
          pronunciation — it stays on this device and is what makes its "hear it" button appear.
          {letterAudioCount > 0 && (
            <span style={{ color: "var(--verd)" }}> {letterAudioCount} letter{letterAudioCount === 1 ? "" : "s"} recorded.</span>
          )}
        </div>
      )}

      {/* Plain flex rows, not a <table> — that's what lets the detail
          panel below drop in directly under the row you tapped, as just
          another block in normal flow, instead of being pinned to the
          bottom of one giant table no matter which row you picked. */}
      <div className="chart" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex" }}>
          <div style={{ width: 44, flexShrink: 0 }} />
          {ORDERS.map((o) => (
            <div
              key={o.n}
              style={{
                width: 40, flexShrink: 0, textAlign: "center", fontSize: 9, letterSpacing: ".1em",
                color: "var(--dim)", fontWeight: 600, padding: "4px 0 8px", textTransform: "uppercase",
              }}
            >
              <span className="gz" style={{ fontSize: 10, display: "block", color: "var(--dim)" }}>{o.am}</span>
              {o.v}
            </div>
          ))}
        </div>

        {FAMS.map((f) => (
          <div key={f.id}>
            <div style={{ display: "flex", alignItems: "center", opacity: unlockedFams.has(f.id) ? 1 : 0.3 }}>
              <div style={{ fontSize: 11, color: "var(--dim)", width: 44, flexShrink: 0, fontWeight: 600 }}>
                {f.cons === "'" ? "—" : f.cons}
              </div>
              {f.chars.map((c, o) => {
                const lvl = (cards[key(f.id, o)] || {}).lvl || 0;
                const cl = lvl >= 5 ? "l4" : lvl >= 3 ? "l3" : lvl >= 1 ? "l2" : unlockedFams.has(f.id) ? "l1" : "";
                const isSel = sel && sel.f === f.id && sel.o === o;
                return (
                  <button
                    key={o}
                    className={"cc " + cl}
                    style={{ flexShrink: 0 }}
                    onClick={() => setSel(isSel ? null : { f: f.id, o })}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            {sel && sel.f === f.id && (
              <div className="card" style={{ margin: "8px 0 12px", borderColor: "var(--rubric)" }}>
                <div className="row-sp" style={{ alignItems: "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span className="gz" style={{ fontSize: 52, color: "var(--rubric)" }}>
                      {FAMS[sel.f].chars[sel.o]}
                    </span>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 600 }}>{FAMS[sel.f].rom[sel.o]}</div>
                      <div className="note">
                        {ORDERS[sel.o].am} · order {sel.o + 1} · {ORDERS[sel.o].say}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSel(null)} style={{ color: "var(--dim)", fontSize: 18, padding: 4 }}>
                    ✕
                  </button>
                </div>
                <div className="rule" style={{ margin: "12px 0" }} />
                <div className="note">{ORDERS[sel.o].hint}.</div>
                {FAMS[sel.f].note && (
                  <div className="note" style={{ marginTop: 6, color: "var(--gold)" }}>{FAMS[sel.f].note}</div>
                )}
                {ARTIC[sel.f] && (
                  <div className="note" style={{ marginTop: 6, color: "var(--gold)" }}>{ARTIC[sel.f]}</div>
                )}
                <div className="rule" style={{ margin: "12px 0" }} />
                <Chant fam={sel.f} audio={audio} />
                <div className="rule" style={{ margin: "12px 0" }} />
                <div className="eyebrow" style={{ marginBottom: 6 }}>Your voice</div>
                <Callout id="cb-voice" seenIntro={seenIntro} onSeen={onSeen}>
                  Record here — your voice, or a relative's — and it plays back everywhere this letter shows
                  up, ahead of the built-in clip.
                </Callout>
                {audio && (
                  <Voice
                    fam={sel.f}
                    order={sel.o}
                    have={audio.have.has(`${sel.f}.${sel.o}`)}
                    onSaved={audio.onSaved}
                  />
                )}
                <div style={{ marginTop: 8 }}>
                  <HearButton fam={sel.f} order={sel.o} audio={audio} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
