import { useState, useMemo, useEffect } from "react";
import { CHAR_MAP, CATS, SENTENCES, FAMS, ORDERS } from "../content.js";
import { getClip } from "../lib/clipStorage.js";

/* ============================================================
   READER
   ============================================================ */

export function Reader({ known, audio }) {
  const [i, setI] = useState(0);
  const [tap, setTap] = useState(null);
  const [showRom, setShowRom] = useState(false);
  const [showEn, setShowEn] = useState(false);

  const [cat, setCat] = useState("family");

  const ranked = useMemo(() => {
    return SENTENCES.filter((s) => s.c === cat)
      .map((s) => {
        const chars = s.w.flatMap((w) => Array.from(w[0])).filter((c) => CHAR_MAP[c]);
        const hit = chars.filter((c) => known.has(c)).length;
        return { sent: s.w, pct: Math.round((hit / Math.max(1, chars.length)) * 100) };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [known, cat]);

  useEffect(() => {
    setI(0);
    setTap(null);
    setShowRom(false);
    setShowEn(false);
  }, [cat]);

  const { sent, pct } = ranked.length ? ranked[i % ranked.length] : { sent: null, pct: 0 };

  if (!sent) {
    return (
      <div className="wrap" style={{ paddingTop: 40, textAlign: "center" }}>
        <p className="note">Nothing in this category yet.</p>
      </div>
    );
  }

  return (
    <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
      <div className="wrap" style={{ paddingTop: 16 }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 2 }}>
          {CATS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setCat(id)}
              style={{
                whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: "1px solid " + (cat === id ? "var(--rubric)" : "var(--line)"),
                background: cat === id ? "rgba(206,69,44,.14)" : "transparent",
                color: cat === id ? "var(--rubric)" : "var(--dim)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="row-sp" style={{ marginBottom: 4 }}>
          <span className="eyebrow">{i + 1} of {ranked.length}</span>
          <span className="pill">{pct}% known letters</span>
        </div>
        <p className="note" style={{ marginBottom: 20, fontSize: 11.5 }}>
          Tap any letter to hear what it is. Letters you've learned are bright.
        </p>

        <div style={{ lineHeight: 1.7, marginBottom: 8 }}>
          {sent.map((w, wi) => (
            <span key={wi} style={{ display: "inline-block", marginRight: 14, marginBottom: 10 }}>
              {Array.from(w[0]).map((c, ci) => {
                const info = CHAR_MAP[c];
                const on = tap && tap.c === c && tap.wi === wi && tap.ci === ci;
                return (
                  <button
                    key={ci}
                    className="gz"
                    onClick={() => setTap(info ? { c, wi, ci } : null)}
                    style={{
                      fontSize: 34,
                      color: on ? "var(--rubric)" : !info ? "var(--dim)" : known.has(c) ? "var(--bone)" : "#5A6488",
                      padding: "0 1px",
                      borderBottom: on ? "2px solid var(--rubric)" : "2px solid transparent",
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </span>
          ))}
        </div>

        {showRom && (
          <div className="note" style={{ fontSize: 14, color: "var(--bone)", marginBottom: 6 }}>
            {sent.map((w) => w[1]).join(" ")}
          </div>
        )}
        {showEn && (
          <div style={{ marginTop: 10 }}>
            {sent.map((w, k) => (
              <div key={k} style={{ display: "flex", gap: 10, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span className="gz" style={{ fontSize: 19, minWidth: 78 }}>{w[0]}</span>
                <span className="note" style={{ flex: 1 }}>
                  <b style={{ color: "var(--bone)" }}>{w[1]} — </b>
                  {w[2]}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button className="speaker" onClick={() => setShowRom(!showRom)}>
            {showRom ? "hide" : "show"} sounds
          </button>
          <button className="speaker" onClick={() => setShowEn(!showEn)}>
            {showEn ? "hide" : "show"} meaning
          </button>
        </div>
      </div>

      <div className="verdict">
        {tap ? (
          <div style={{ marginBottom: 12 }}>
            <div className="row-sp">
              <span className="gz" style={{ fontSize: 42, color: "var(--rubric)" }}>{tap.c}</span>
              <div style={{ flex: 1, textAlign: "right" }}>
                <div style={{ fontSize: 20, fontWeight: 600 }}>
                  {FAMS[CHAR_MAP[tap.c].fam].rom[CHAR_MAP[tap.c].order]}
                </div>
                <div className="note" style={{ fontSize: 11 }}>
                  {FAMS[CHAR_MAP[tap.c].fam].chars[0]} + {ORDERS[CHAR_MAP[tap.c].order].v} mark ·{" "}
                  {ORDERS[CHAR_MAP[tap.c].order].am}
                </div>
                {audio && audio.have.has(`${CHAR_MAP[tap.c].fam}.${CHAR_MAP[tap.c].order}`) && (
                  <button
                    className="speaker"
                    style={{ marginTop: 6, borderColor: "var(--verd)", color: "#8FD9B4" }}
                    onClick={async () => {
                      const f = CHAR_MAP[tap.c].fam, o = CHAR_MAP[tap.c].order;
                      const u = await getClip(f, o);
                      if (u) new Audio(u).play().catch(() => {});
                    }}
                  >
                    ► play
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="vsub" style={{ marginBottom: 12 }}>
            Read it left to right, one syllable per letter.
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" style={{ flex: 1 }} onClick={() => { setTap(null); setShowRom(false); setShowEn(false); setI((i - 1 + ranked.length) % ranked.length); }}>
            Back
          </button>
          <button className="btn" style={{ flex: 2 }} onClick={() => { setTap(null); setShowRom(false); setShowEn(false); setI((i + 1) % ranked.length); }}>
            Next sentence
          </button>
        </div>
      </div>
    </div>
  );
}
