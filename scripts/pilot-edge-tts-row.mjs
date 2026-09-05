#!/usr/bin/env node
// Pilot: does edge-tts (free, no API key) produce a usable whole-row
// recitation, sliced into per-letter clips the same way the real
// Addis-AI-based pipeline does? Deliberately reuses the SAME
// row-slicing logic as generate-official-audio.mjs (detectSilences /
// cutSegment / sliceRow / chooseRowBounds) rather than a simplified
// reimplementation, so a result here actually predicts what the real
// pipeline would do -- these functions aren't exported from that script
// (a standalone CLI tool, not a module), so they're duplicated here,
// same as this project's other diagnostic scripts already do.
//
// Deliberately does NOT touch public/audio/official/ -- output goes to
// scripts/pilot-edge-tts-out/ only. This is a pilot for ONE row, not a
// batch regeneration (see the conversation this came out of: a batch
// script that skipped this pilot step would have silently regenerated
// the exact isolated-glyph hallucination bug this project already found
// and fixed with Addis AI, just with a different TTS provider).
//
// Usage:
//   node scripts/pilot-edge-tts-row.mjs [--fam 0] [--voice am-ET-MekdesNeural]

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { RAW, rowText } from "./content.mjs";
import { chooseRowBounds } from "./row-slicing.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "pilot-edge-tts-out");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const FAM = parseInt(arg("fam", "0"), 10);
const VOICE = arg("voice", "am-ET-MekdesNeural");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr }));
    p.on("error", reject);
  });
}

async function synthesize(text, voice, outPath) {
  // Shells out to a small inline Python snippet rather than a separate
  // .py file -- this is a one-off pilot script, not part of the ongoing
  // pipeline. Passes the proxy explicitly: confirmed locally that
  // edge_tts.Communicate does NOT pick up HTTPS_PROXY automatically for
  // its websocket connection despite trust_env=True elsewhere in its own
  // session setup -- harmless to pass proxy=None outside a proxied
  // sandbox (aiohttp just doesn't proxy in that case).
  const script = `
import asyncio, os, sys
import edge_tts

async def main():
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    communicate = edge_tts.Communicate(sys.argv[1], sys.argv[2], proxy=proxy)
    await communicate.save(sys.argv[3])

asyncio.run(main())
`;
  const { code, stderr } = await run("python3", ["-c", script, text, voice, outPath]);
  if (code !== 0) throw new Error(`edge-tts synthesis failed: ${stderr.slice(0, 500)}`);
}

async function probeDuration(audioPath) {
  const { code, stdout, stderr } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audioPath,
  ]);
  const dur = parseFloat(stdout.trim());
  if (code !== 0 || !Number.isFinite(dur)) throw new Error(`ffprobe failed: ${stderr.slice(0, 200) || `exit ${code}`}`);
  return dur;
}

async function detectSilences(audioPath) {
  const { stderr } = await run("ffmpeg", [
    "-i", audioPath, "-af", "silencedetect=noise=-25dB:d=0.03", "-f", "null", "-",
  ]);
  const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
  return starts.map((s, i) => ({ start: s, end: ends[i] })).filter((g) => Number.isFinite(g.end) && g.end > g.start);
}

async function cutSegment(audioPath, start, end, outPath) {
  let { code } = await run("ffmpeg", ["-y", "-loglevel", "error", "-i", audioPath, "-ss", start.toFixed(3), "-to", end.toFixed(3), "-c", "copy", outPath]);
  if (code !== 0) {
    ({ code } = await run("ffmpeg", ["-y", "-loglevel", "error", "-i", audioPath, "-ss", start.toFixed(3), "-to", end.toFixed(3), "-acodec", "libmp3lame", "-q:a", "4", outPath]));
  }
  return code === 0;
}

async function sliceRow(audioPath, duration, syllableCount, sliceDir, slicePrefix) {
  const allGaps = await detectSilences(audioPath);
  const EDGE = 0.05 * duration;
  const interior = allGaps.filter((g) => g.start > EDGE && g.end < duration - EDGE);
  const wantGaps = syllableCount - 1;
  console.error(`  silencedetect (duration=${duration.toFixed(2)}s, EDGE=${EDGE.toFixed(2)}s): ${JSON.stringify(allGaps.map((g) => [g.start.toFixed(2), g.end.toFixed(2)]))}`);
  console.error(`  interior gaps: ${interior.length} (wanted ${wantGaps})`);

  const { bounds, confidence, flagged, note } = chooseRowBounds(interior, syllableCount, duration);

  const PAD = 0.06;
  const names = [];
  for (let i = 0; i < bounds.length; i++) {
    const [s, e] = bounds[i];
    const outName = `${slicePrefix}-${i}.mp3`;
    const ok = await cutSegment(audioPath, Math.max(0, s - PAD), Math.min(duration, e + PAD), path.join(sliceDir, outName));
    if (!ok) return { ok: false, reason: `ffmpeg failed to cut segment ${i}` };
    names.push(outName);
  }
  return { ok: true, names, flagged, confidence, note };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const [chars] = RAW[FAM];
  const letters = Array.from(chars);
  const text = rowText(FAM);
  const wholeRowPath = path.join(OUT_DIR, `row-${FAM}-whole.mp3`);
  const slicePrefix = `letter-${FAM}`;

  console.error(`[pilot] family ${FAM}: "${text}" (voice=${VOICE})`);
  console.error(`[pilot] synthesizing whole-row recitation via edge-tts...`);
  await synthesize(text, VOICE, wholeRowPath);

  const duration = await probeDuration(wholeRowPath);
  console.error(`[pilot] whole-row clip: ${duration.toFixed(2)}s`);

  const result = await sliceRow(wholeRowPath, duration, letters.length, OUT_DIR, slicePrefix);
  if (!result.ok) {
    console.error(`[pilot] FAILED: ${result.reason}`);
    process.exit(1);
  }

  console.error(`[pilot] sliced into ${result.names.length} files, confidence=${result.confidence}${result.flagged ? " (FLAGGED)" : ""}`);
  if (result.note) console.error(`[pilot] note: ${result.note}`);

  // A small texts.json in the same shape verify_audio_content_*.py
  // already expect, scoped to just this one pilot row -- lets both
  // existing ASR verification scripts run against the pilot output
  // unmodified, pointed at this directory instead of
  // public/audio/official/.
  const textsPath = path.join(OUT_DIR, "pilot-texts.json");
  await writeFile(textsPath, JSON.stringify({
    rows: [{ id: `pilot_row_${FAM}`, text, letterFiles: result.names }],
    anchors: [],
    phrases: [],
  }, null, 2));

  console.error(`\n[pilot] letters in this row, in order: ${letters.join(" ")}`);
  console.error(`[pilot] output: ${OUT_DIR}`);
  console.error(`[pilot] texts JSON for the ASR scripts: ${textsPath}`);
}

main().catch((e) => {
  console.error(`[pilot] ERROR: ${e.message}`);
  process.exit(1);
});
