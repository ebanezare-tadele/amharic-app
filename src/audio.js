// Pure audio-addressing logic, split out of App.jsx so it can be unit
// tested without pulling in React/DOM/SpeechSynthesis.

// numeral is only ever used to key state.cards for Stage 3's own per-numeral
// mastery levels (src/components/Numerals.jsx) -- it never appears in the
// letter-review pool/due queue, and there's no Voice/Chant recording for it.
export const WORD_FAM = { anchor: 900, phrase: 901, numeral: 902 };

// Real recordings from Addis AI (Voice 2, am-hamen), generated once
// (scripts/generate-official-audio.mjs) and baked in as static files
// under public/audio/official/, filed under the same (fam, order)
// addressing the personal-recording system already uses. Not currently
// played anywhere in the app -- the "hear it" feature that used to offer
// this tier was pulled after real-world content-verification runs (see
// scripts/verify_audio_content_dvoice.py's history) found the generated
// clips unreliable. Kept here, tested, as the file-naming contract the
// generation/verification scripts still use, in case a trustworthy audio
// source is found later.
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
