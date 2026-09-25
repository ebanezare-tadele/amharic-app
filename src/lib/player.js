// One shared <audio> element for every "hear it" in the app.
//
// iOS Safari only lets an audio element start playing from inside a tap
// handler, and it grants that per element. A fresh `new Audio()` created
// after an `await` (fetching a recorded clip, or the next letter of a
// chanted row) is outside the tap and gets blocked. Reusing a single
// element that was started once inside a tap keeps it allowed for every
// later play, whatever the timing. It also means starting one sound
// always stops the previous one instead of talking over it.

// 44-byte silent WAV, played once inside the first tap to unlock the element.
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

let el = null;
let unlocked = false;
let settle = null; // resolves the in-flight playUrl() promise, if any

function element() {
  if (!el) el = new Audio();
  return el;
}

// Call synchronously at the top of a tap handler, before any `await`.
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const a = element();
  a.src = SILENT;
  const p = a.play();
  if (p) p.catch(() => {});
}

export function stopAudio() {
  if (settle) settle(false);
  if (el) el.pause();
  try {
    window.speechSynthesis.cancel();
  } catch (e) {}
}

// Plays url to the end. Resolves true once it finishes, false if it
// couldn't play or was stopped (by stopAudio or a newer playUrl).
export function playUrl(url) {
  stopAudio();
  const a = element();
  return new Promise((resolve) => {
    const done = (ok) => {
      if (settle !== done) return;
      settle = null;
      a.onended = a.onerror = null;
      resolve(ok);
    };
    settle = done;
    a.onended = () => done(true);
    a.onerror = () => done(false);
    a.src = url;
    const p = a.play();
    if (p) p.catch(() => done(false));
  });
}
