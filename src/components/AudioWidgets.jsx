import { useState, useEffect, useRef } from "react";
import { FAMS } from "../content.js";
import { getClip, putClip, deleteClip } from "../lib/clipStorage.js";

/* ============================================================
   VOICE
   Record a letter (or word) once — yours, or a relative's — and
   play it back with the ► play button that appears once one exists.
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

export function Chant({ fam, compact }) {
  const F = FAMS[fam];
  const [i, setI] = useState(-1);
  const [tempo, setTempo] = useState(620);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => {
    setI(-1);
    clearInterval(timer.current);
  }, [fam]);

  const play = () => {
    clearInterval(timer.current);
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
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
        <button className="speaker" onClick={play}>► chant the row</button>
        {!compact && (
          <button className="speaker" onClick={() => setTempo(tempo === 620 ? 900 : tempo === 900 ? 400 : 620)}>
            {tempo === 620 ? "steady" : tempo === 900 ? "slow" : "fast"}
          </button>
        )}
      </div>
    </div>
  );
}
