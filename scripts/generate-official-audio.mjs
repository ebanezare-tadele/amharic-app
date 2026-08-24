#!/usr/bin/env node
// One-time generation job: turns every letter/word/phrase in the app into a
// real Amharic audio clip via the Addis AI Voice 2 API, and zips the result
// into amharic-audio.zip next to this script.
//
// This is meant to run as a GitHub Actions job (see
// .github/workflows/generate-audio.yml), triggered manually from the
// Actions tab, with the API key supplied as the ADDIS_API_KEY repo secret.
// It also runs fine locally if you'd rather do that:
//   ADDIS_API_KEY=sk_... node scripts/generate-official-audio.mjs
//
// Requires only a modern Node.js (18+, for built-in fetch). No npm install.

const ADDIS_API_KEY = process.env.ADDIS_API_KEY;
if (!ADDIS_API_KEY) {
  console.error("Missing ADDIS_API_KEY environment variable. In GitHub Actions this comes from the ADDIS_API_KEY repo secret.");
  process.exit(1);
}

import { mkdir, writeFile, readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "official-audio-out");
const ZIP_PATH = path.join(__dirname, "amharic-audio.zip");

const VOICE_ID = "am-hamen"; // "the canonical Amharic example" per Addis AI's own docs
const ENDPOINT = "https://api.addisassistant.com/api/v1/voice/generations";

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

// ---- Build the full job list: {id, filename, text, reqId} ----
//
// reqId (not id) is what actually goes in the API's client_request_id
// field. It's random and generated fresh every time this script runs,
// specifically so a later run can never accidentally replay a cached
// result from an earlier one — Addis AI's idempotency system treats a
// reused client_request_id as "give me back what I generated for that
// id before," not "generate this again." The first, 4-way-concurrent
// run of this script used a deterministic id ("letter_0_0", etc.) here
// and got hammered with CONCURRENT_GENERATION_LIMIT/RATE_LIMITED errors
// while retrying — plausible enough that some requests got confused
// server-side about which text belonged to which id. A later run
// reusing those same deterministic ids could then get back a replay of
// that earlier chaos instead of a fresh generation. crypto.randomUUID()
// makes that impossible: nothing from a previous run can ever match.
import { randomUUID } from "node:crypto";

const jobs = [];
RAW.forEach((fam, famIdx) => {
  const chars = Array.from(fam[0]);
  chars.forEach((ch, orderIdx) => {
    jobs.push({
      id: `letter_${famIdx}_${orderIdx}`,
      filename: `letter-${famIdx}-${orderIdx}.mp3`,
      // A bare single glyph has no sentence for the model to anchor
      // to — Addis AI's own docs recommend complete sentences with
      // Ethiopic punctuation for natural, correct output. A trailing
      // full stop is the smallest nudge toward that shape.
      text: `${ch}።`,
      reqId: randomUUID(),
    });
  });
});
// Reports of wrong audio weren't limited to single letters — anchor
// words came back as a longer, sometimes-coherent phrase padded around
// the target word (e.g. "ልጅ" / child came back as "this child"), or as
// an outright incoherent longer utterance. That's consistent with the
// same root cause as the bare-glyph case: an isolated word, with no
// sentence shape, giving the model room to pad or hallucinate around
// it. Every anchor word gets the same trailing-full-stop treatment.
ANCHORS.forEach((word, i) => {
  jobs.push({ id: `anchor_${i}`, filename: `anchor-${i}.mp3`, text: `${word}።`, reqId: randomUUID() });
});

// Phrases are already real sentences, but none of them carried ending
// punctuation either. Most are statements/greetings (full stop); a
// handful are genuine questions and get a question mark instead —
// using a period there would be grammatically wrong, not just stylistically off.
const QUESTION_PHRASES = new Set([2, 3, 5, 6, 12]); // indices into PHRASES below
PHRASES.forEach((phrase, i) => {
  const mark = QUESTION_PHRASES.has(i) ? "?" : "።";
  jobs.push({ id: `phrase_${i}`, filename: `phrase-${i}.mp3`, text: `${phrase}${mark}`, reqId: randomUUID() });
});

console.log(`${jobs.length} clips to generate (${RAW.length * 7} letters, ${ANCHORS.length} anchor words, ${PHRASES.length} phrases).`);
console.log(`Estimate: well under 10 minutes of audio total, ~5 ETB/minute per Addis AI's pricing.`);

// ---- Generate one clip ----
//
// Two independent retry layers, deliberately different:
//
// 1. Transient-error retries (generateOnce, below): the SAME
//    client_request_id across attempts, per Addis AI's idempotency
//    guidance -- these are for "did that actually go through," so a
//    replay of the same logical request is exactly what we want.
//
// 2. Quality retries (generateOne, further down): a FRESH
//    client_request_id every attempt. This voice model sometimes
//    hallucinates -- pads a short, isolated input (a single letter, a
//    single word) into a much longer, unrelated utterance. Measured
//    across the first real batch: ~1 in 5 clips came back 5-13 seconds
//    long when a real one is under ~2s, for input that should produce
//    one short syllable or word. Nothing in the response marks a clip
//    as bad -- but this API's mp3 output is constant-bitrate, so file
//    size is a reliable stand-in for duration, and a clip landing way
//    outside the normal size band for its category is almost certainly
//    hallucinated. Reusing the same request id here would just replay
//    the same bad result, so each quality attempt asks for a genuinely
//    new generation instead.

// Addis AI allows only one voice generation in flight per account at a
// time (HTTP 429 CONCURRENT_GENERATION_LIMIT if you overlap requests), on
// top of a plain rate limit (429 RATE_LIMITED). So jobs run strictly one
// at a time (see CONCURRENCY below) and a 429 gets a real wait — honoring
// Retry-After when the API sends one, otherwise backing off hard — rather
// than the quick retry that's fine for an ordinary transient error.
const MAX_ATTEMPTS = 6;

async function generateOnce(job, reqId) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const genRes = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "x-api-key": ADDIS_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text: job.text,
          voice_id: VOICE_ID,
          language: "am",
          output_format: "mp3_44100",
          client_request_id: reqId,
        }),
      });
      if (!genRes.ok) {
        const body = await genRes.text().catch(() => "");
        if (genRes.status === 429 && attempt < MAX_ATTEMPTS) {
          const retryAfter = Number(genRes.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 4000 * attempt;
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
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr;
}

// Size bands per category, in bytes, at this API's observed ~65-70kbps
// constant bitrate. Min guards against a truncated/near-silent clip;
// max is the hallucination guard described above. Bands are generous —
// the point is to catch the dramatic outliers (5-13s instead of ~1s),
// not to police normal length variation between e.g. short and long
// phrases.
const SIZE_LIMITS = {
  letter: { min: 2000, max: 25000 }, // ~0.2s-2.8s: one glyph + a full stop
  anchor: { min: 2000, max: 35000 }, // ~0.2s-4s: one word + a full stop
  phrase: { min: 2000, max: 55000 }, // ~0.2s-6.3s: a short sentence
};
const QUALITY_ATTEMPTS = 4;

function sizeLimitFor(job) {
  if (job.id.startsWith("letter_")) return SIZE_LIMITS.letter;
  if (job.id.startsWith("anchor_")) return SIZE_LIMITS.anchor;
  return SIZE_LIMITS.phrase;
}

async function generateOne(job) {
  const outPath = path.join(OUT_DIR, job.filename);
  try {
    const existing = await stat(outPath);
    if (existing.size > 0) return { job, skipped: true };
  } catch {}

  const limit = sizeLimitFor(job);
  const mid = (limit.min + limit.max) / 2;
  let best = null; // closest-to-normal out-of-band clip seen, kept as a last resort
  let lastErr;

  for (let qAttempt = 1; qAttempt <= QUALITY_ATTEMPTS; qAttempt++) {
    try {
      const bytes = await generateOnce(job, randomUUID());
      const size = bytes.length;
      if (size >= limit.min && size <= limit.max) {
        await writeFile(outPath, bytes);
        return { job, ok: true, requality: qAttempt > 1 };
      }
      if (!best || Math.abs(size - mid) < Math.abs(best.size - mid)) best = { bytes, size };
      lastErr = new Error(`clip size ${size}B outside [${limit.min}, ${limit.max}]B (likely hallucinated/truncated), attempt ${qAttempt}/${QUALITY_ATTEMPTS}`);
    } catch (e) {
      lastErr = e;
    }
  }
  // Never got a normal-sized clip after all quality attempts. Ship the
  // closest-to-normal one anyway rather than nothing — flagged clearly
  // so it's easy to find and regenerate by hand — instead of leaving
  // this letter/word/phrase with no audio at all.
  if (best) {
    await writeFile(outPath, best.bytes);
    return { job, ok: true, flagged: true, error: String(lastErr) };
  }
  return { job, error: String(lastErr) };
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
  // Strictly one request in flight at a time — see the comment above
  // generateOnce(). A small pause between jobs (even successful ones)
  // keeps the plain per-minute rate limit from tripping too.
  const PACING_MS = 700;

  for (const job of jobs) {
    const result = await generateOne(job);
    if (result.skipped) skipped++;
    else if (result.ok) {
      done++;
      if (result.requality) requalified++;
      if (result.flagged) flagged.push(result);
    } else failed.push(result);
    const n = done + skipped + failed.length;
    process.stdout.write(`\r[${n}/${jobs.length}] generated=${done} skipped=${skipped} requalified=${requalified} flagged=${flagged.length} failed=${failed.length}   `);
    if (!result.skipped) await new Promise((r) => setTimeout(r, PACING_MS));
  }
  console.log("\n");

  if (failed.length) {
    console.log(`${failed.length} clips failed outright (no clip of any size came back):`);
    failed.forEach((f) => console.log(`  ${f.job.id} (${JSON.stringify(f.job.text)}): ${f.error}`));
    console.log("Re-run the workflow to retry just the missing ones (already-saved files are skipped) — but note a fresh Actions run starts from an empty folder, so partial failures are only resumable within a local re-run.\n");
  }

  if (flagged.length) {
    console.log(`${flagged.length} clips never landed in the normal size range after ${QUALITY_ATTEMPTS} attempts each — shipped anyway (closest-to-normal size seen), but worth a manual listen before trusting them:`);
    flagged.forEach((f) => console.log(`  ${f.job.filename} (${JSON.stringify(f.job.text)}): ${f.error}`));
    console.log("");
  }

  const filenames = await readdir(OUT_DIR);
  const files = [];
  for (const name of filenames) {
    const data = await readFile(path.join(OUT_DIR, name));
    files.push({ name, data: new Uint8Array(data) });
  }
  const zip = await buildZip(files);
  await writeFile(ZIP_PATH, zip);

  console.log(`Wrote ${files.length} clips into ${ZIP_PATH}`);

  if (failed.length) {
    console.error(`${failed.length} clip(s) failed — see log above.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
