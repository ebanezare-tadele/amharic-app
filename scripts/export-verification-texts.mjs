#!/usr/bin/env node
// Dumps the exact texts every shipped clip is supposed to say into a
// small JSON file the Python closed-set verifier
// (scripts/verify_audio_content.py) reads. Kept as a separate export
// step (rather than duplicating this in Python) so the verifier can
// never drift out of sync with what was actually asked of Addis AI —
// see scripts/content.mjs, the single source of truth both files share.

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RAW, ANCHORS, PHRASES, rowText, anchorText, phraseText } from "./content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "verification-texts.json");

const rows = RAW.map((fam, i) => ({
  id: `row_${i}`,
  text: rowText(i),
  letterFiles: Array.from({ length: fam[0].length }, (_, o) => `letter-${i}-${o}.mp3`),
}));

const anchors = ANCHORS.map((_, i) => ({ id: `anchor_${i}`, text: anchorText(i), file: `anchor-${i}.mp3` }));
const phrases = PHRASES.map((_, i) => ({ id: `phrase_${i}`, text: phraseText(i), file: `phrase-${i}.mp3` }));

await writeFile(OUT_PATH, JSON.stringify({ rows, anchors, phrases }, null, 2));
console.log(`Wrote ${rows.length} row + ${anchors.length} anchor + ${phrases.length} phrase texts to ${OUT_PATH}`);
