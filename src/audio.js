// Pure audio-addressing logic, split out of App.jsx so it can be unit
// tested without pulling in React/DOM/SpeechSynthesis. Behavior must stay
// identical to what HearButton/Chant in App.jsx rely on — see
// src/audio.test.js for the contract this is expected to hold.

export const WORD_FAM = { anchor: 900, phrase: 901 };

// Real recordings from Addis AI (Voice 2, am-hamen), generated once
// (scripts/generate-official-audio.mjs) and baked in as static files
// under public/audio/official/, filed under the same (fam, order)
// addressing the personal-recording system already uses. Not every
// letter/word/phrase necessarily has one — only what actually passed
// verification ships — so the app checks manifest.json (via
// officialKeyFromFilename below) rather than assuming a file exists.
export function officialAudioUrl(fam, order, base = import.meta.env.BASE_URL) {
  const b = `${base}audio/official/`;
  if (fam === WORD_FAM.anchor) return `${b}anchor-${order}.mp3`;
  if (fam === WORD_FAM.phrase) return `${b}phrase-${order}.mp3`;
  return `${b}letter-${fam}-${order}.mp3`;
}

// manifest.json lists filenames, e.g. "letter-3-0.mp3" — converted here
// to the same "fam.order" key shape audio.have (personal recordings)
// already uses, so both sets can be checked the same way everywhere.
export function officialKeyFromFilename(name) {
  let m = /^letter-(\d+)-(\d+)\.mp3$/.exec(name);
  if (m) return `${m[1]}.${m[2]}`;
  m = /^anchor-(\d+)\.mp3$/.exec(name);
  if (m) return `${WORD_FAM.anchor}.${m[1]}`;
  m = /^phrase-(\d+)\.mp3$/.exec(name);
  if (m) return `${WORD_FAM.phrase}.${m[1]}`;
  return null;
}
