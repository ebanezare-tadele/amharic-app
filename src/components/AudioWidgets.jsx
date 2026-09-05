import { useState, useEffect, useRef } from "react";
import { FAMS } from "../content.js";
import { officialAudioUrl } from "../audio.js";
import { getClip, putClip, deleteClip } from "../lib/clipStorage.js";

/* ============================================================
   HEAR BUTTON
   The single "hear it" affordance used everywhere in the app —
   letters, anchor words, phrases, and post-answer drill review.
   Priority: your own recording, then a real official clip if the
   generation pipeline actually produced and verified one for
   this exact letter/word (see officialAudioUrl and the manifest
   fetch in AmharicFidel — nothing plays unless it's actually
   listed there), then the device's own Amharic voice, else this
   hides rather than play something that was never verified.
   Earlier baked-in clips asked the TTS model to read one isolated
   glyph with no sentence context, which turned out to hallucinate
   into unrelated full-sentence audio often enough (~1 in 5) that
   it couldn't be trusted; the current pipeline never asks for
   that — see the comment atop scripts/generate-official-audio.mjs
   for how it avoids it (whole rows recited naturally, then sliced
   using real speech-recognition timestamps) and verifies every
   clip against what was actually said before it ships. Drill
   questions themselves never get this button — only the review
   screen after you've already answered, since most question kinds
   ask "what does this sound like," and playing the sound first
   would hand over the answer.
   ============================================================ */

export function HearButton({ fam, order, audio, text }) {
  const [voice, setVoice] = useState(null);
  useEffect(() => {
    const find = () => {
      try {
        const v = window.speechSynthesis.getVoices().find((x) => /^am/i.test(x.lang));
        if (v) setVoice(v);
      } catch (e) {}
    };
    find();
    try {
      window.speechSynthesis.onvoiceschanged = find;
    } catch (e) {}
  }, []);

  const key = `${fam}.${order}`;
  const have = audio && audio.have.has(key);
  const haveOfficial = audio && audio.official && audio.official.has(key);
  if (!have && !haveOfficial && !voice) return null;

  const speak = () => {
    const t = text || (FAMS[fam] ? FAMS[fam].chars[order] : "");
    if (!voice || !t) return;
    const u = new SpeechSynthesisUtterance(t);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  };

  const play = async () => {
    if (have) {
      const recorded = await getClip(fam, order);
      if (recorded) {
        try {
          await new Audio(recorded).play();
          return;
        } catch (e) {}
      }
    }
    if (haveOfficial) {
      try {
        await new Audio(officialAudioUrl(fam, order)).play();
        return;
      } catch (e) {}
    }
    speak();
  };

  return (
    <button className="speaker" onClick={play}>
      ► hear it
    </button>
  );
}

/* ============================================================
   VOICE
   Record a letter (or word) once — yours, or a relative's — and
   it plays back everywhere that letter appears (see HearButton).
   ============================================================ */

export function Voice({ fam, order, have, onSaved }) {
  const [st, setSt] = useState("idle"); // idle | rec | busy
  const [err, setErr] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const mr = useRef(null);
  const fileRef = useRef(null);

  const play = async () => {
    const url = await getClip(fam, order);
    if (!url) return setErr("Nothing recorded for this letter yet.");
    try {
      await new Audio(url).play();
    } catch (e) {
      setErr("Playback blocked. Tap once anywhere first, then try again.");
    }
  };

  const commit = async (url) => {
    setSt("busy");
    try {
      const idx = await putClip(fam, order, url);
      onSaved(idx);
      setErr(null);
    } catch (e) {
      setErr("Couldn't save that clip.");
    }
    setSt("idle");
  };

  const save = (url) => {
    if (url.length > 700000) {
      setSt("idle");
      return setErr("That clip is too long. Aim for about a second.");
    }
    commit(url);
  };

  const start = async () => {
    setErr(null);
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      return setErr("Mic isn't reachable here. Use the upload button instead.");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const fr = new FileReader();
        fr.onload = () => save(fr.result);
        fr.readAsDataURL(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
      };
      mr.current = r;
      r.start();
      setSt("rec");
    } catch (e) {
      setErr("Mic blocked. Allow microphone access, or upload a clip instead.");
    }
  };

  const stop = () => {
    if (mr.current && mr.current.state !== "inactive") mr.current.stop();
    setSt("busy");
  };

  const upload = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => save(fr.result);
    fr.readAsDataURL(f);
  };

  const del = async () => {
    if (!confirmDel) return setConfirmDel(true);
    setSt("busy");
    try {
      const idx = await deleteClip(fam, order);
      onSaved(idx);
      setErr(null);
    } catch (e) {
      setErr("Couldn't remove that clip.");
    }
    setSt("idle");
    setConfirmDel(false);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {have && (
          <button className="speaker" style={{ borderColor: "var(--verd)", color: "#8FD9B4" }} onClick={play}>
            ► play
          </button>
        )}
        {st === "rec" ? (
          <button className="speaker" style={{ borderColor: "var(--rubric)", color: "var(--rubric)" }} onClick={stop}>
            ■ stop
          </button>
        ) : (
          <button className="speaker" disabled={st === "busy"} onClick={start}>
            {st === "busy" ? "saving…" : have ? "● re-record" : "● record it"}
          </button>
        )}
        <button className="speaker" onClick={() => fileRef.current && fileRef.current.click()}>
          ⤒ upload
        </button>
        <input ref={fileRef} type="file" accept="audio/*" onChange={upload} style={{ display: "none" }} />
        {have && (
          <button
            className="speaker"
            style={confirmDel ? { borderColor: "var(--rubric)", color: "var(--rubric)" } : { color: "var(--dim)" }}
            onClick={del}
          >
            {confirmDel ? "tap again to remove" : "✕ remove"}
          </button>
        )}
      </div>
      {err && <div className="note" style={{ color: "var(--rubric)", marginTop: 6, fontSize: 11.5 }}>{err}</div>}
    </div>
  );
}

/* ============================================================
   CHANT
   The row recited in rhythm — the oldest way this gets taught,
   and the one thing you already have.
   ============================================================ */

export function Chant({ fam, audio, compact }) {
  const F = FAMS[fam];
  const [i, setI] = useState(-1);
  const [tempo, setTempo] = useState(620);
  const [voice, setVoice] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    const find = () => {
      try {
        const v = window.speechSynthesis.getVoices().find((x) => /^am/i.test(x.lang));
        if (v) setVoice(v);
      } catch (e) {}
    };
    find();
    try {
      window.speechSynthesis.onvoiceschanged = find;
    } catch (e) {}
  }, []);
  // Bumped on every play() / playSound() / fam change / unmount, so an
  // in-flight playSound() loop (each step awaits real audio, unlike the
  // fixed-interval visual version) can tell its own run is stale and
  // stop touching state instead of racing a newer one.
  const playToken = useRef(0);

  useEffect(() => () => { clearInterval(timer.current); playToken.current++; }, []);
  useEffect(() => {
    setI(-1);
    clearInterval(timer.current);
    playToken.current++;
  }, [fam]);

  const play = () => {
    clearInterval(timer.current);
    playToken.current++;
    let n = 0;
    setI(0);
    timer.current = setInterval(() => {
      n += 1;
      if (n > 6) {
        clearInterval(timer.current);
        setTimeout(() => setI(-1), tempo);
        return;
      }
      setI(n);
    }, tempo);
  };

  // The visual chant above is timing-only — no sound. This actually
  // plays the row, one order at a time: your own recording, else a
  // verified official clip if one exists for that letter, else the
  // device's own Amharic voice — same priority and same "nothing plays
  // unless it's verified" rule HearButton uses (see its comment).
  // Sequenced off each clip's own "ended" event rather than a fixed
  // interval, since clip lengths vary.
  const playSound = async () => {
    clearInterval(timer.current);
    const token = ++playToken.current;
    for (let o = 0; o < 7; o++) {
      if (playToken.current !== token) return;
      setI(o);
      const have = audio && audio.have.has(`${fam}.${o}`);
      const recorded = have ? await getClip(fam, o) : null;
      if (playToken.current !== token) return;
      const haveOfficial = !recorded && audio && audio.official && audio.official.has(`${fam}.${o}`);
      const url = recorded || (haveOfficial ? officialAudioUrl(fam, o) : null);
      if (url) {
        await new Promise((resolve) => {
          const el = new Audio(url);
          el.addEventListener("ended", resolve);
          el.addEventListener("error", resolve);
          el.play().catch(resolve);
        });
      } else if (voice) {
        await new Promise((resolve) => {
          const u = new SpeechSynthesisUtterance(F.chars[o]);
          u.voice = voice;
          u.lang = voice.lang;
          u.rate = 0.85;
          u.onend = resolve;
          u.onerror = resolve;
          window.speechSynthesis.speak(u);
        });
      }
    }
    if (playToken.current === token) setI(-1);
  };

  const canHear = voice || F.chars.some((_, o) => audio && (audio.have.has(`${fam}.${o}`) || (audio.official && audio.official.has(`${fam}.${o}`))));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", gap: 2, margin: "6px 0 4px" }}>
        {F.chars.map((c, k) => (
          <div key={k} className={"chantcell" + (k === i ? " on" : "")}>{c}</div>
        ))}
      </div>
      <div style={{ textAlign: "center", minHeight: 30 }}>
        <span className="disp" style={{ fontSize: 26, color: i >= 0 ? "var(--bone)" : "var(--dim)" }}>
          {i >= 0 ? F.rom[i] : F.rom.join(" · ")}
        </span>
      </div>
      {!compact && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
          <button className="speaker" onClick={play}>► chant the row</button>
          {canHear && <button className="speaker" onClick={playSound}>► hear it</button>}
          <button className="speaker" onClick={() => setTempo(tempo === 620 ? 900 : tempo === 900 ? 400 : 620)}>
            {tempo === 620 ? "steady" : tempo === 900 ? "slow" : "fast"}
          </button>
        </div>
      )}
      {compact && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
          <button className="speaker" onClick={play}>► chant the row</button>
          {canHear && <button className="speaker" onClick={playSound}>► hear it</button>}
        </div>
      )}
    </div>
  );
}
