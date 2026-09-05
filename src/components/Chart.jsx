import { useState } from "react";
import { ORDERS, FAMS, ARTIC, GEEZ_NUM, ANCHORS, PHRASES } from "../content.js";
import { key } from "../state.js";
import { WORD_FAM } from "../audio.js";
import { Chant, Voice, HearButton } from "./AudioWidgets.jsx";
import { Callout } from "./Callout.jsx";
import { WordEntry } from "./Drills.jsx";
import { SyncPanel, ComparePanel } from "./Sync.jsx";

/* ============================================================
   CHART
   ============================================================ */

export function Chart({ cards, unlockedFams, audio, onReset, seenIntro, onSeen, level, xp, streakDays }) {
  const [confirmReset, setConfirmReset] = useState(false);
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

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>Ge'ez numerals</div>
      <p className="note" style={{ marginBottom: 10, fontSize: 11.5 }}>
        Still used on clock faces, church calendars, and chapter headings. Everyday writing uses 1 2 3.
        Likely adapted from Greek and Coptic letter-numerals — the same trick Roman numerals play with
        Latin letters. Bigger numbers just line these up left to right: 23 is ፳፫ (haya sost, "twenty
        three"), 155 is ፻፶፭ (meto hamsa amist, "one hundred fifty five").
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {GEEZ_NUM.map(([g, n, r]) => (
          <div key={n} style={{ background: "var(--ink2)", border: "1px solid var(--line)", borderRadius: 9, padding: "7px 10px", textAlign: "center", minWidth: 52 }}>
            <div className="gz" style={{ fontSize: 20 }}>{g}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--bone)" }}>{r}</div>
            <div className="note" style={{ fontSize: 10 }}>{n}</div>
          </div>
        ))}
      </div>

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>Punctuation</div>
      <div className="note" style={{ marginBottom: 4 }}>
        <span className="gz" style={{ fontSize: 20, color: "var(--bone)" }}>።</span>{"  "}full stop ·{" "}
        <span className="gz" style={{ fontSize: 20, color: "var(--bone)" }}>፣</span>{"  "}comma ·{" "}
        <span className="gz" style={{ fontSize: 20, color: "var(--bone)" }}>፡</span>{"  "}the old word divider, now replaced by a plain space
      </div>

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>Where this comes from</div>
      <div className="note" style={{ marginBottom: 6 }}>
        Ge'ez — the script every letter on this chart is built from — descended from the Ancient South
        Arabian alphabet, carried across the Red Sea into the Kingdom of Aksum, in what's now northern
        Ethiopia and Eritrea. Like its ancestor, it started as an abjad: consonants only, vowels left to
        guesswork.
      </div>
      <div className="note" style={{ marginBottom: 6 }}>
        Sometime around the 4th century, Ge'ez did something no other Semitic script had: it started
        bending each consonant into seven shapes, one per vowel, instead of leaving the vowel unwritten —
        centuries before Hebrew did the same with its own vowel points. One of the most famous early
        examples still stands: King Ezana's stone stele at Aksum, the same inscription carved three times
        over in Ge'ez, Sabaean, and Greek, announcing his conversion to Christianity. The system on this
        chart descends directly from that one.
      </div>
      <div className="note" style={{ marginBottom: 6 }}>
        There's a name for a script that works this way — abugida — and it's borrowed straight from
        Ge'ez: the first four letters in its own traditional order, አ ቡ ጊ ዳ (ə-bu-gi-da), the same way
        "alphabet" comes from the Greek alpha-beta.
      </div>
      <div className="note" style={{ marginBottom: 6 }}>
        Amharic split off from Ge'ez's spoken form by around the 13th century, keeping the script but
        bending it to different sounds — which is exactly why five letters on this chart (ሐ ኀ ሠ ዐ ፀ) spell
        distinctions Ge'ez once made and Amharic no longer does; tap any of them above for what they used
        to sound like. Ge'ez itself stopped being anyone's native language centuries ago, but never really
        left — it's still the language of the Ethiopian Orthodox Church's liturgy today.
      </div>
      <div className="note">
        Amharic didn't just inherit Ge'ez's alphabet as-is, either — it needed sounds Ge'ez's Semitic
        phonology never had, partly from contact with the Cushitic languages already spoken in the
        region. Rather than invent new shapes from nothing, scribes extended existing Ge'ez letters:
        add a stroke to ሰ (se) and it becomes ሸ (she); the same move turns ተ (te) into ቸ (che), ነ (ne)
        into ኘ (nye). That family-resemblance you can still see between rows on this chart — ስ/ሽ, ት/ች,
        ን/ኝ — is that history, not coincidence. It's how the system grew from Ge'ez's own roughly 26
        consonant shapes to the 33-34 Amharic uses today. The newest layer is more recent still: ቨ (v)
        and ፐ (p) were added specifically to spell foreign names and loanwords — sounds that don't occur
        natively in Amharic at all.
      </div>

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>What the script doesn't tell you</div>
      <div className="note" style={{ marginBottom: 6 }}>
        Amharic doubles consonants to change meaning, and it never writes the doubling.{" "}
        <span className="gz" style={{ fontSize: 19, color: "var(--bone)" }}>አለ</span> is
        <b style={{ color: "var(--bone)" }}> ale</b>, "he said." The same three letters with a held l are{" "}
        <b style={{ color: "var(--bone)" }}>alle</b>, "there is." Nothing on the page separates them.
      </div>
      <div className="note" style={{ marginBottom: 6 }}>
        Sixth order is the other ambiguity: it can be a bare consonant or carry a faint vowel, and the
        letter looks the same either way.
      </div>
      <div className="note">
        Both gaps close with hearing, not with reading — which is the real argument for getting a relative
        onto the record button.
      </div>

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 4 }}>Anchor words</div>
      <p className="note" style={{ marginBottom: 4, fontSize: 11.5 }}>
        One real word per letter family — what each base shape gets anchored to the first time you meet
        it in a lesson.
      </p>
      {FAMS.map((f) => {
        const a = ANCHORS[f.id];
        if (!a || !a[0]) return null;
        return (
          <WordEntry key={f.id} text={a[0]} rom={a[1]} gloss={a[2]} fam={WORD_FAM.anchor} order={f.id} audio={audio} />
        );
      })}

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Phrases worth knowing
      </div>
      {PHRASES.map((p, i) => (
        <WordEntry key={p[0]} text={p[0]} rom={p[1]} gloss={p[2]} fam={WORD_FAM.phrase} order={i} audio={audio} />
      ))}

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>Sync across devices</div>
      <SyncPanel />

      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>Compare progress</div>
      <ComparePanel mine={{ level, xp, streakDays, masteredCount: Object.values(cards).filter((c) => (c.lvl || 0) >= 5).length }} />

      <div className="rule" />
      <button
        className="speaker"
        style={confirmReset ? { borderColor: "var(--rubric)", color: "var(--rubric)" } : undefined}
        onClick={() => (confirmReset ? (onReset(), setConfirmReset(false)) : setConfirmReset(true))}
      >
        {confirmReset ? "tap again to erase everything" : "start over"}
      </button>
      {confirmReset && (
        <div className="note" style={{ marginTop: 6, fontSize: 11.5 }}>
          Wipes lessons, streak, and letter mastery. Recordings are kept.
        </div>
      )}
    </div>
  );
}
