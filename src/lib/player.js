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

// url -> object URL of the whole clip, fetched once per session.
const blobs = new Map();

// Clips are fetched whole and played from memory rather than handed to
// <audio> as URLs: <audio> sends Range requests, and the service worker
// never caches their 206 responses, so clips would never work offline.
// A plain fetch gets a 200 the service worker stores (see vite.config.js).
async function resolveSrc(url) {
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (blobs.has(url)) return blobs.get(url);
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const obj = URL.createObjectURL(await r.blob());
    blobs.set(url, obj);
    return obj;
  } catch {
    return null;
  }
}

let el = null;
let unlocked = false;
let settle = null; // resolves the in-flight playUrl() promise, if any
let pending = null; // token of a playUrl() still fetching its clip

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
  pending = null;
  if (settle) settle(false);
  if (el) el.pause();
  try {
    window.speechSynthesis.cancel();
  } catch {
    // no speech synthesis on this device
  }
}

// Plays url to the end. Resolves true once it finishes, false if it
// couldn't play or was stopped (by stopAudio or a newer playUrl).
export async function playUrl(url) {
  stopAudio();
  const mine = {};
  pending = mine;
  const src = await resolveSrc(url);
  // A newer playUrl or a stopAudio happened while fetching.
  if (pending !== mine) return false;
  pending = null;
  if (!src) return false;
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
    a.src = src;
    const p = a.play();
    if (p) p.catch(() => done(false));
  });
}
