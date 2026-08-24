#!/usr/bin/env node
// One-time generation job: turns every letter/word/phrase in the app into a
// real, verified Amharic audio clip via the Addis AI Voice 2 API, and zips
// the result into amharic-audio.zip next to this script.
//
// This is meant to run as a GitHub Actions job (see
// .github/workflows/generate-audio.yml), triggered manually from the
// Actions tab, with the API key supplied as the ADDIS_API_KEY repo secret.
// It also runs fine locally if you'd rather do that:
//   ADDIS_API_KEY=sk_... node scripts/generate-official-audio.mjs
//
// Requires Node.js 18+ (built-in fetch) and Python 3 with faster-whisper
// installed (pip install faster-whisper) for the verification step — see
// scripts/whisper_worker.py for why and how.
//
// ---- Why this version looks different from the first one ----
//
// The original approach asked the TTS model to read one isolated Ge'ez
// glyph per clip. That turned out to be the actual root cause of the
// wrong/garbled-audio reports (not a bug to patch, a shape of input the
// model wasn't built for): a bare single syllable has no sentence for a
// sentence-level TTS model to anchor to, and it would sometimes pad or
// hallucinate a short isolated input into a longer, unrelated utterance.
// Measured directly: ~1 in 5 letter/word clips came back 5-13s long for
// input that should produce under 2s of speech, even after adding
// trailing punctuation per the vendor's own guidance.
//
// This version never asks for an isolated glyph at all. A family's 7
// letters are generated as ONE natural recitation of the whole row (e.g.
// "ለ፣ ሉ፣ ሊ፣ ላ፣ ሌ፣ ል፣ ሎ።") — literally how the fidel is traditionally
// chanted aloud, not an isolated syllable — and then
// scripts/whisper_worker.py uses real speech recognition (word-level
// timestamps) to find exactly where each syllable falls and slices the
// row into the 7 per-letter clips the app actually plays. Anchor words
// and phrases were already natural-shaped input, so they're unchanged in
// content, but every clip in every category now gets checked against
// what was actually said (via Whisper) rather than just how long the
// file is — a wrong-word clip at a normal duration would have passed the
// old check silently.

const ADDIS_API_KEY = process.env.ADDIS_API_KEY;
if (!ADDIS_API_KEY) {
  console.error("Missing ADDIS_API_KEY environment variable. In GitHub Actions this comes from the ADDIS_API_KEY repo secret.");
  process.exit(1);
}

import { mkdir, writeFile, readdir, stat, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "official-audio-out");
const ZIP_PATH = path.join(__dirname, "amharic-audio.zip");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");

const VOICE_ID = "am-hamen"; // "the canonical Amharic example" per Addis AI's own docs
const ENDPOINT = "https://api.addisassistant.com/api/v1/voice/generations";

// SMOKE_TEST=1 (or the workflow's "smoke_test" input) runs just a
// handful of jobs — one row, one anchor, one phrase — so a change to
// this script or the whisper worker can be sanity-checked for a few
// dollars of API usage and a couple of minutes, instead of finding out
// something's wrong only after the full ~82-job batch (and its retries)
// have already run.
const SMOKE_TEST = process.env.SMOKE_TEST === "1";

// ---- Content: same data as src/App.jsx's RAW / ANCHORS / PHRASES ----

const RAW = [
  ["ለሉሊላሌልሎ", "l", "lä"],
  ["መሙሚማሜምሞ", "m", "mä"],
  ["ረሩሪራሬርሮ", "r", "rä"],
  ["ሰሱሲሳሴስሶ", "s", "sä"],
  ["በቡቢባቤብቦ", "b", "bä"],
  ["ተቱቲታቴትቶ", "t", "tä"],
  ["ነኑኒናኔንኖ", "n", "nä"],
  ["ከኩኪካኬክኮ", "k", "kä"],
  ["ወዉዊዋዌውዎ", "w", "wä"],
  ["የዩዪያዬይዮ", "y", "yä"],
  ["ደዱዲዳዴድዶ", "d", "dä"],
  ["ገጉጊጋጌግጎ", "g", "gä"],
  ["ሀሁሂሃሄህሆ", "h", "hä"],
  ["አኡኢኣኤእኦ", "'", "ä"],
  ["ቀቁቂቃቄቅቆ", "q", "qä"],
  ["ጠጡጢጣጤጥጦ", "t'", "t'ä"],
  ["ሸሹሺሻሼሽሾ", "sh", "shä"],
  ["ቸቹቺቻቼችቾ", "ch", "chä"],
  ["ጀጁጂጃጄጅጆ", "j", "jä"],
  ["ኘኙኚኛኜኝኞ", "ny", "nyä"],
  ["ዘዙዚዛዜዝዞ", "z", "zä"],
  ["ጨጩጪጫጬጭጮ", "ch'", "ch'ä"],
  ["ፈፉፊፋፌፍፎ", "f", "fä"],
  ["ፐፑፒፓፔፕፖ", "p", "pä"],
  ["ጸጹጺጻጼጽጾ", "ts'", "ts'ä"],
  ["ዠዡዢዣዤዥዦ", "zh", "zhä"],
  ["ኸኹኺኻኼኽኾ", "kh", "khä"],
  ["ቨቩቪቫቬቭቮ", "v", "vä"],
  ["ጰጱጲጳጴጵጶ", "p'", "p'ä"],
  ["ሐሑሒሓሔሕሖ", "h", "hä"],
  ["ኀኁኂኃኄኅኆ", "h", "hä"],
  ["ሠሡሢሣሤሥሦ", "s", "sä"],
  ["ዐዑዒዓዔዕዖ", "'", "ä"],
  ["ፀፁፂፃፄፅፆ", "ts'", "ts'ä"],
];

const ANCHORS = [
  "ልጅ", "መኪና", "ራስ", "ሰላም", "ቤት", "ተማሪ", "ነጭ", "ከተማ", "ወተት", "የት",
  "ደህና", "ገንዘብ", "ሀገር", "አባት", "ቀን", "ጠዋት", "ሽሮ", "ችግር", "ጀበና", "ነኝ",
  "ዘጠኝ", "ጨረቃ", "ፈረስ", "ፖሊስ", "ጸሎት", "ዥዋዥዌ", "መኸር", "ቪዛ", "ጳጳስ", "መጽሐፍ",
  "ኃይል", "ሥራ", "ዓይን", "ፀሐይ",
];

const PHRASES = [
  "ሰላም", "ጤና ይስጥልኝ", "እንደምን አደርክ", "እንደምን አደርሽ", "ደህና ነኝ",
  "ስምህ ማን ነው", "ስምሽ ማን ነው", "አመሰግናለሁ", "ይቅርታ", "እባክህ",
  "ደህና ሁን", "አይገባኝም", "ስንት ነው", "ውሃ እፈልጋለሁ",
];

// ---- Build the full job list ----
//
// reqId is what actually goes in the API's client_request_id field —
// random and fresh per attempt (see generateOne below), so a retry can
// never accidentally replay a previous attempt's result.

let jobs = [];
RAW.forEach((fam, famIdx) => {
  const chars = Array.from(fam[0]);
  jobs.push({
    id: `row_${famIdx}`,
    category: "row",
    // Ethiopic comma between syllables, full stop at the end — read as
    // one natural recitation of the row, the way the alphabet is
    // actually chanted, not as 7 isolated glyphs.
    text: chars.join("፣ ") + "።",
    expected: { syllables: chars },
    slicePrefix: `letter-${famIdx}`,
  });
});
ANCHORS.forEach((word, i) => {
  jobs.push({ id: `anchor_${i}`, category: "anchor", text: `${word}።`, expected: { text: word }, filename: `anchor-${i}.mp3` });
});
const QUESTION_PHRASES = new Set([2, 3, 5, 6, 12]); // indices into PHRASES: genuine questions get "?" not "።"
PHRASES.forEach((phrase, i) => {
  const mark = QUESTION_PHRASES.has(i) ? "?" : "።";
  jobs.push({ id: `phrase_${i}`, category: "phrase", text: `${phrase}${mark}`, expected: { text: phrase }, filename: `phrase-${i}.mp3` });
});

if (SMOKE_TEST) {
  jobs = [jobs.find((j) => j.category === "row"), jobs.find((j) => j.category === "anchor"), jobs.find((j) => j.category === "phrase")];
  console.log("SMOKE_TEST=1 — running only 3 jobs (1 row, 1 anchor, 1 phrase) to sanity-check the pipeline.\n");
}

console.log(`${jobs.length} generation jobs (${RAW.length} letter rows covering ${RAW.length * 7} letters, ${ANCHORS.length} anchor words, ${PHRASES.length} phrases).`);

// ---- Whisper verification worker (see scripts/whisper_worker.py) ----
// A single long-lived Python process, talked to over stdin/stdout with
// one JSON object per line each way — loading the model is the
// expensive part, so it happens once for the whole run, not once per
// clip.

class WhisperWorker {
  constructor() {
    this.proc = spawn("python3", [path.join(__dirname, "whisper_worker.py")], { stdio: ["pipe", "pipe", "inherit"] });
    this.rl = createInterface({ input: this.proc.stdout });
    this.pending = new Map();
    this.nextId = 0;
    this.rl.on("line", (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      const resolve = this.pending.get(msg.id);
      if (resolve) {
        this.pending.delete(msg.id);
        resolve(msg);
      }
    });
    this.proc.on("exit", (code) => {
      for (const resolve of this.pending.values()) resolve({ verified: false, reason: `whisper worker exited unexpectedly (code ${code})` });
      this.pending.clear();
    });
  }
  check(req) {
    const id = String(this.nextId++);
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.proc.stdin.write(JSON.stringify({ ...req, id }) + "\n");
    });
  }
  close() {
    this.proc.stdin.end();
  }
}

// ---- Generate one clip ----
//
// Addis AI allows only one voice generation in flight per account at a
// time (HTTP 429 CONCURRENT_GENERATION_LIMIT if you overlap requests), on
// top of a plain rate limit (429 RATE_LIMITED). Jobs run strictly one at
// a time and a 429 gets a real wait — honoring Retry-After when the API
// sends one, otherwise backing off hard. Capped at MAX_RETRY_WAIT_MS so
// one pathological Retry-After value can't stall a single attempt for
// an unbounded stretch — a smoke test on 2026-08-24 sat with zero output
// for 7+ minutes on one job with no way to tell "still legitimately
// backing off" from "hung" apart from cancelling the run, which is
// exactly the failure mode this cap and the logging below fix.
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
// here would just replay the same result Whisper already rejected), up
// to this many tries. Unlike the old size-heuristic version, a clip that
// never verifies is NOT shipped as a last resort — the app already
// falls back gracefully (personal recording -> device voice -> hidden)
// for anything missing, and shipping audio Whisper flagged as wrong
// defeats the entire point of checking.
const QUALITY_ATTEMPTS = 4;

async function alreadyDone(job) {
  if (job.category === "row") {
    for (let o = 0; o < 7; o++) {
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

async function generateOne(job, worker) {
  if (await alreadyDone(job)) return { job, skipped: true };

  let lastReason;
  for (let qAttempt = 1; qAttempt <= QUALITY_ATTEMPTS; qAttempt++) {
    console.error(`[${job.id}] quality attempt ${qAttempt}/${QUALITY_ATTEMPTS}: generating "${job.text}"...`);
    const bytes = await generateOnce(job.id, job.text, randomUUID());
    const tmpPath = path.join(OUT_DIR, `.tmp-${job.id}-${qAttempt}.mp3`);
    await writeFile(tmpPath, bytes);

    const req = { audio: tmpPath, category: job.category, expected: job.expected };
    if (job.category === "row") {
      req.sliceDir = OUT_DIR;
      req.slicePrefix = job.slicePrefix;
    }
    console.error(`[${job.id}] quality attempt ${qAttempt}: verifying with Whisper...`);
    const result = await worker.check(req);
    console.error(`[${job.id}] quality attempt ${qAttempt}: verified=${result.verified} duration=${result.duration} reason=${result.reason || "(none)"}`);

    if (result.verified) {
      if (job.category === "row") {
        await unlink(tmpPath).catch(() => {});
        return { job, ok: true, requality: qAttempt > 1, flagged: !!result.flagged, note: result.reason, files: result.sliced };
      }
      await rename(tmpPath, path.join(OUT_DIR, job.filename));
      return { job, ok: true, requality: qAttempt > 1, flagged: !!result.flagged, note: result.reason, files: [job.filename] };
    }
    lastReason = result.reason;
    await unlink(tmpPath).catch(() => {});
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
  const worker = new WhisperWorker();

  let done = 0, skipped = 0, requalified = 0, failed = [], flagged = [];
  const shipped = []; // filenames of every verified clip, for manifest.json
  // Strictly one Addis AI request in flight at a time (see generateOnce);
  // a small pause between jobs keeps the plain per-minute rate limit
  // from tripping too.
  const PACING_MS = 700;

  for (const job of jobs) {
    const result = await generateOne(job, worker);
    if (result.skipped) {
      skipped++;
      if (job.category === "row") for (let o = 0; o < 7; o++) shipped.push(`${job.slicePrefix}-${o}.mp3`);
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
  worker.close();
  console.log("\n");

  if (failed.length) {
    console.log(`${failed.length} job(s) never produced a Whisper-verified clip (not shipped — the app falls back to a personal recording or device voice for these):`);
    failed.forEach((f) => console.log(`  ${f.job.id} (${JSON.stringify(f.job.text)}): ${f.error}`));
    console.log("");
  }

  if (flagged.length) {
    console.log(`${flagged.length} clip(s) verified but with a caveat worth a manual listen (see whisper_worker.py's "flagged" reasons):`);
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
