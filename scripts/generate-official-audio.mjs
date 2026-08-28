#!/usr/bin/env node
// One-time generation job: turns every letter row/word/phrase in the app
// into a real Amharic audio clip via the Addis AI Voice 2 API, and zips
// the result into amharic-audio.zip next to this script.
//
// This is meant to run as a GitHub Actions job (see
// .github/workflows/generate-audio.yml), triggered manually from the
// Actions tab, with the API key supplied as the ADDIS_API_KEY repo secret.
// It also runs fine locally if you'd rather do that (needs ffmpeg/ffprobe
// on PATH, which most systems already have):
//   ADDIS_API_KEY=sk_... node scripts/generate-official-audio.mjs
//
// Requires Node.js 18+ (built-in fetch) and ffmpeg/ffprobe on PATH. No
// npm install, and — as of this version — no Python/ML dependency either;
// see the long comment below for why that was tried and reverted.
//
// ---- The actual history here, because it explains every design choice ----
//
// v1 asked the TTS model to read one isolated Ge'ez glyph per clip. Root
// cause of the "wrong/garbled audio" reports: a bare single syllable has
// no sentence for a sentence-level TTS model to anchor to, and it would
// sometimes pad or hallucinate a short isolated input into a longer,
// unrelated utterance (measured: ~1 in 5 letter/word clips came back
// 5-13s long for input that should be under 2s). Fixed by generating a
// whole family's 7 letters as ONE natural recitation of the row (e.g.
// "ለ፣ ሉ፣ ሊ፣ ላ፣ ሌ፣ ል፣ ሎ።") — literally how the fidel is traditionally
// chanted, not an isolated syllable — instead of one glyph at a time.
// That part of the fix is real and is still here.
//
// v2 tried adding content verification on top: transcribe every clip
// with faster-whisper (real open-source speech recognition) and check
// it against the expected text, instead of just checking duration. This
// was a bad idea in practice, not because verifying content is wrong in
// principle, but because faster-whisper's available checkpoints turned
// out to have no meaningful Amharic support: real smoke tests against
// real clips produced transcriptions in random unrelated scripts and
// even plain English words (Telugu, Bengali, Kazakh Cyrillic, Burmese,
// "Quit", "flix"), changing on every attempt against the *same* audio --
// the textbook signature of a model hallucinating on input it has no
// real grip on, not a language it's simply weak at. Worse: the clips
// this rejected had entirely normal, in-band durations, meaning the
// underlying TTS audio may well have been correct the whole time and
// the verification layer was the actual thing sabotaging it. That
// approach (and the faster-whisper/Python dependency it needed) is gone.
//
// This version verifies using signals that don't require any model to
// understand Amharic at all:
//   - ffprobe's actual measured duration against a per-category sane
//     band (this is what v1 approximated with file size; ffmpeg is
//     already on the runner, so measuring it directly is free and more
//     accurate than a size-based proxy).
//   - For row clips specifically: ffmpeg's silencedetect filter finds
//     the pauses between the 7 comma-separated syllables (a real
//     acoustic signal — commas produce audible pauses in TTS output —
//     not a claim about what was said), and slices the row into the 7
//     per-letter files the app plays using those gap boundaries.
// Neither of these can hallucinate a wrong language, because neither
// one is trying to understand what was said — only how long it took
// and where the pauses are.

const ADDIS_API_KEY = process.env.ADDIS_API_KEY;
if (!ADDIS_API_KEY) {
  console.error("Missing ADDIS_API_KEY environment variable. In GitHub Actions this comes from the ADDIS_API_KEY repo secret.");
  process.exit(1);
}

import { mkdir, writeFile, readdir, readFile, rename, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chooseRowBounds } from "./row-slicing.mjs";
import { RAW, ANCHORS, PHRASES, rowText, anchorText, phraseText } from "./content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "official-audio-out");
const ZIP_PATH = path.join(__dirname, "amharic-audio.zip");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");

const VOICE_ID = "am-hamen"; // "the canonical Amharic example" per Addis AI's own docs
const ENDPOINT = "https://api.addisassistant.com/api/v1/voice/generations";

// SMOKE_TEST=1 (or the workflow's "smoke_test" input) runs just a
// handful of jobs — one row, one anchor, one phrase — so a change to
// this script can be sanity-checked for a few cents and a minute or two
// instead of finding out something's wrong only after the full ~82-job
// batch (and its retries) have already run.
const SMOKE_TEST = process.env.SMOKE_TEST === "1";

// ---- Content: RAW / ANCHORS / PHRASES live in scripts/content.mjs, ----
// shared with the content-verification tooling so both always agree on
// exactly what text a clip was supposed to say.

// ---- Build the full job list ----

let jobs = [];
RAW.forEach((fam, famIdx) => {
  const chars = Array.from(fam[0]);
  jobs.push({
    id: `row_${famIdx}`,
    category: "row",
    // Ethiopic comma between syllables, full stop at the end — read as
    // one natural recitation of the row, the way the alphabet is
    // actually chanted, not as 7 isolated glyphs. The commas are also
    // what silenceSliceRow() below relies on for pauses to cut at.
    text: rowText(famIdx),
    syllableCount: chars.length,
    slicePrefix: `letter-${famIdx}`,
  });
});
ANCHORS.forEach((word, i) => {
  jobs.push({ id: `anchor_${i}`, category: "anchor", text: anchorText(i), filename: `anchor-${i}.mp3` });
});
PHRASES.forEach((phrase, i) => {
  jobs.push({ id: `phrase_${i}`, category: "phrase", text: phraseText(i), filename: `phrase-${i}.mp3` });
});

if (SMOKE_TEST) {
  jobs = [jobs.find((j) => j.category === "row"), jobs.find((j) => j.category === "anchor"), jobs.find((j) => j.category === "phrase")];
  console.log("SMOKE_TEST=1 — running only 3 jobs (1 row, 1 anchor, 1 phrase) to sanity-check the pipeline.\n");
}

console.log(`${jobs.length} generation jobs (${RAW.length} letter rows covering ${RAW.length * 7} letters, ${ANCHORS.length} anchor words, ${PHRASES.length} phrases).`);

// ---- ffmpeg/ffprobe helpers — signal-based checks, no language model ----

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

async function probeDuration(audioPath) {
  const { code, stdout, stderr } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audioPath,
  ]);
  const dur = parseFloat(stdout.trim());
  if (code !== 0 || !Number.isFinite(dur)) throw new Error(`ffprobe failed: ${stderr.slice(0, 200) || `exit ${code}`}`);
  return dur;
}

// Pauses in the audio, found purely from loudness — no understanding of
// what's being said, so nothing here can mistake Amharic for Telugu.
// Deliberately permissive (quiet threshold, short minimum duration):
// measured directly against a real row clip that Addis AI doesn't pace
// its commas evenly. Of 3 real inter-syllable spans, one packed 3-4
// syllables into 0.84s with gaps too short (<0.12s) to register at a
// stricter setting, while the others got a full 0.2-0.3s pause. A
// single threshold tuned to hit exactly the right count for THIS row
// would very likely miss a different row's pacing entirely (or pick up
// consonant-transition noise as false gaps) — see sliceRow below for
// how the "pick the most prominent candidates" strategy this permissive
// detection feeds into is more robust to that than an exact-count match.
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
    // -c copy can miss precise mp3 frame boundaries; re-encode this one slice if so.
    ({ code } = await run("ffmpeg", ["-y", "-loglevel", "error", "-i", audioPath, "-ss", start.toFixed(3), "-to", end.toFixed(3), "-acodec", "libmp3lame", "-q:a", "4", outPath]));
  }
  return code === 0;
}

// Slices a row clip into its 7 syllables using the pauses between them.
// Interior gaps only (near-start/near-end silence is lead-in/lead-out,
// not a separator). Rather than requiring exactly syllableCount-1 gaps
// at one fixed threshold — which measurement showed breaks down because
// real inter-syllable pauses vary in length within the same clip — this
// takes every candidate gap the permissive detectSilences() finds and
// picks the syllableCount-1 LONGEST ones as the true syllable
// boundaries. Real separating pauses should generally be more prominent
// than incidental sub-syllable noise, so "most prominent N" is more
// robust across 34 different rows than "exactly N at threshold X".
async function sliceRow(audioPath, duration, syllableCount, sliceDir, slicePrefix) {
  const allGaps = await detectSilences(audioPath);
  const EDGE = 0.05 * duration;
  const interior = allGaps.filter((g) => g.start > EDGE && g.end < duration - EDGE);
  const wantGaps = syllableCount - 1;

  // Real gap positions, not just the count -- the count alone can't say
  // whether the threshold is too strict (real pauses being missed) or
  // something else entirely, and guessing at a fix without this was
  // exactly the mistake made with Whisper.
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

// Per-category sane duration bands, in seconds. Min guards against a
// truncated/near-silent clip; max catches the hallucination-into-a-
// longer-utterance failure mode measured in v1.
const DURATION_LIMITS = {
  row: { min: 1.0, max: 14.0 },      // 7 short syllables, comma-paced
  anchor: { min: 0.25, max: 4.5 },   // one word
  phrase: { min: 0.25, max: 7.0 },   // a short sentence
};

// ---- Addis AI generation ----
//
// Addis AI allows only one voice generation in flight per account at a
// time (HTTP 429 CONCURRENT_GENERATION_LIMIT if you overlap requests), on
// top of a plain rate limit (429 RATE_LIMITED). Jobs run strictly one at
// a time and a 429 gets a real wait — honoring Retry-After when the API
// sends one, capped so one pathological value can't stall a single
// attempt indefinitely.
const MAX_ATTEMPTS = 6;
const MAX_RETRY_WAIT_MS = 60_000;

async function generateOnce(jobId, text, reqId) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.error(`  [${jobId}] generateOnce attempt ${attempt}/${MAX_ATTEMPTS}...`);
      const genRes = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "x-api-key": ADDIS_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({ text, voice_id: VOICE_ID, language: "am", output_format: "mp3_44100", client_request_id: reqId }),
      });
      if (!genRes.ok) {
        const body = await genRes.text().catch(() => "");
        if (genRes.status === 429 && attempt < MAX_ATTEMPTS) {
          const retryAfter = Number(genRes.headers.get("retry-after"));
          const waitMs = Math.min(
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 4000 * attempt,
            MAX_RETRY_WAIT_MS
          );
          console.error(`  [${jobId}] 429 rate-limited, waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 1}...`);
          await new Promise((r) => setTimeout(r, waitMs));
          lastErr = new Error(`generate HTTP 429: ${body.slice(0, 300)}`);
          continue;
        }
        throw new Error(`generate HTTP ${genRes.status}: ${body.slice(0, 300)}`);
      }
      const genJson = await genRes.json();
      const audioUrl = genJson?.data?.audio_url;
      if (!audioUrl) throw new Error(`no audio_url in response: ${JSON.stringify(genJson).slice(0, 300)}`);

      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) throw new Error(`audio fetch HTTP ${audioRes.status}`);
      return new Uint8Array(await audioRes.arrayBuffer());
    } catch (e) {
      lastErr = e;
      console.error(`  [${jobId}] attempt ${attempt} error: ${e.message}`);
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr;
}

// Quality retries: a FRESH client_request_id every attempt (reusing one
// would just replay the same result), up to this many tries. A clip
// that never verifies is NOT shipped as a last resort — the app falls
// back gracefully (personal recording -> device voice -> hidden) for
// anything missing.
const QUALITY_ATTEMPTS = 4;

async function alreadyDone(job) {
  if (job.category === "row") {
    for (let o = 0; o < job.syllableCount; o++) {
      try {
        const s = await stat(path.join(OUT_DIR, `${job.slicePrefix}-${o}.mp3`));
        if (s.size === 0) return false;
      } catch {
        return false;
      }
    }
    return true;
  }
  try {
    const s = await stat(path.join(OUT_DIR, job.filename));
    return s.size > 0;
  } catch {
    return false;
  }
}

async function generateOne(job) {
  if (await alreadyDone(job)) return { job, skipped: true };
  const limit = DURATION_LIMITS[job.category];

  let lastReason;
  for (let qAttempt = 1; qAttempt <= QUALITY_ATTEMPTS; qAttempt++) {
    console.error(`[${job.id}] quality attempt ${qAttempt}/${QUALITY_ATTEMPTS}: generating "${job.text}"...`);
    const bytes = await generateOnce(job.id, job.text, randomUUID());
    const tmpPath = path.join(OUT_DIR, `.tmp-${job.id}-${qAttempt}.mp3`);
    await writeFile(tmpPath, bytes);

    let duration;
    try {
      duration = await probeDuration(tmpPath);
    } catch (e) {
      lastReason = `ffprobe failed: ${e.message}`;
      console.error(`[${job.id}] quality attempt ${qAttempt}: ${lastReason}`);
      await unlink(tmpPath).catch(() => {});
      continue;
    }
    console.error(`[${job.id}] quality attempt ${qAttempt}: duration=${duration.toFixed(2)}s`);
    if (duration < limit.min || duration > limit.max) {
      lastReason = `duration ${duration.toFixed(2)}s outside [${limit.min}, ${limit.max}]s for category ${job.category}`;
      console.error(`[${job.id}] quality attempt ${qAttempt}: rejected — ${lastReason}`);
      await unlink(tmpPath).catch(() => {});
      continue;
    }

    if (job.category === "row") {
      const result = await sliceRow(tmpPath, duration, job.syllableCount, OUT_DIR, job.slicePrefix);
      await unlink(tmpPath).catch(() => {});
      if (!result.ok) {
        lastReason = result.reason;
        console.error(`[${job.id}] quality attempt ${qAttempt}: slicing rejected — ${lastReason}`);
        continue;
      }
      console.error(`[${job.id}] quality attempt ${qAttempt}: sliced OK${result.flagged ? ` (flagged, ${result.confidence}: ${result.note})` : ""}`);
      return { job, ok: true, requality: qAttempt > 1, flagged: result.flagged, note: result.note, files: result.names };
    }

    await rename(tmpPath, path.join(OUT_DIR, job.filename));
    console.error(`[${job.id}] quality attempt ${qAttempt}: accepted`);
    return { job, ok: true, requality: qAttempt > 1, flagged: false, files: [job.filename] };
  }
  return { job, error: `never verified after ${QUALITY_ATTEMPTS} attempts — last reason: ${lastReason}` };
}

// ---- Minimal dependency-free ZIP writer (stored, no compression --   ----
// ---- mp3s don't compress further anyway, so this is not a shortcut) ----

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime() {
  const d = new Date();
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

async function buildZip(files) {
  // files: [{ name, data: Uint8Array }]
  const { time, date } = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const size = f.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // stored, no compression
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, Buffer.from(f.data));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);

    offset += local.length + nameBytes.length + f.data.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, end]);
}

// ---- Run ----

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let done = 0, skipped = 0, requalified = 0, failed = [], flagged = [];
  const shipped = []; // filenames of every verified clip, for manifest.json
  // Strictly one Addis AI request in flight at a time (see generateOnce);
  // a small pause between jobs keeps the plain per-minute rate limit
  // from tripping too.
  const PACING_MS = 700;

  for (const job of jobs) {
    const result = await generateOne(job);
    if (result.skipped) {
      skipped++;
      if (job.category === "row") for (let o = 0; o < job.syllableCount; o++) shipped.push(`${job.slicePrefix}-${o}.mp3`);
      else shipped.push(job.filename);
    } else if (result.ok) {
      done++;
      if (result.requality) requalified++;
      if (result.flagged) flagged.push({ job, note: result.note });
      shipped.push(...result.files);
    } else {
      failed.push(result);
    }
    const n = done + skipped + failed.length;
    process.stdout.write(`\r[${n}/${jobs.length}] generated=${done} skipped=${skipped} requalified=${requalified} flagged=${flagged.length} failed=${failed.length}   `);
    if (!result.skipped) await new Promise((r) => setTimeout(r, PACING_MS));
  }
  console.log("\n");

  if (failed.length) {
    console.log(`${failed.length} job(s) never produced a verified clip (not shipped — the app falls back to a personal recording or device voice for these):`);
    failed.forEach((f) => console.log(`  ${f.job.id} (${JSON.stringify(f.job.text)}): ${f.error}`));
    console.log("");
  }

  if (flagged.length) {
    console.log(`${flagged.length} clip(s) verified but with a caveat worth a manual listen:`);
    flagged.forEach((f) => console.log(`  ${f.job.id}: ${f.note}`));
    console.log("");
  }

  await writeFile(MANIFEST_PATH, JSON.stringify(shipped.sort(), null, 2));
  console.log(`manifest.json: ${shipped.length} verified file(s) the app will actually use.`);

  const filenames = (await readdir(OUT_DIR)).filter((n) => !n.startsWith(".tmp-"));
  const files = [];
  for (const name of filenames) {
    const data = await readFile(path.join(OUT_DIR, name));
    files.push({ name, data: new Uint8Array(data) });
  }
  const zip = await buildZip(files);
  await writeFile(ZIP_PATH, zip);

  console.log(`Wrote ${files.length} file(s) (clips + manifest.json) into ${ZIP_PATH}`);

  if (failed.length) {
    console.error(`${failed.length} job(s) failed verification entirely — see log above.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
