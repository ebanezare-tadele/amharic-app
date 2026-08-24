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

// ---- Build the full job list: {id, filename, text} ----

const jobs = [];
RAW.forEach((fam, famIdx) => {
  const chars = Array.from(fam[0]);
  chars.forEach((ch, orderIdx) => {
    jobs.push({
      id: `letter_${famIdx}_${orderIdx}`,
      filename: `letter-${famIdx}-${orderIdx}.mp3`,
      text: ch,
    });
  });
});
ANCHORS.forEach((word, i) => {
  jobs.push({ id: `anchor_${i}`, filename: `anchor-${i}.mp3`, text: word });
});
PHRASES.forEach((phrase, i) => {
  jobs.push({ id: `phrase_${i}`, filename: `phrase-${i}.mp3`, text: phrase });
});

console.log(`${jobs.length} clips to generate (${RAW.length * 7} letters, ${ANCHORS.length} anchor words, ${PHRASES.length} phrases).`);
console.log(`Estimate: well under 10 minutes of audio total, ~5 ETB/minute per Addis AI's pricing.`);

// ---- Generate one clip, with a couple of retries on transient failure ----

async function generateOne(job) {
  const outPath = path.join(OUT_DIR, job.filename);
  try {
    const existing = await stat(outPath);
    if (existing.size > 0) return { job, skipped: true };
  } catch {}

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
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
          client_request_id: job.id,
        }),
      });
      if (!genRes.ok) {
        const body = await genRes.text().catch(() => "");
        throw new Error(`generate HTTP ${genRes.status}: ${body.slice(0, 300)}`);
      }
      const genJson = await genRes.json();
      const audioUrl = genJson?.data?.audio_url;
      if (!audioUrl) throw new Error(`no audio_url in response: ${JSON.stringify(genJson).slice(0, 300)}`);

      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) throw new Error(`audio fetch HTTP ${audioRes.status}`);
      const bytes = new Uint8Array(await audioRes.arrayBuffer());
      await writeFile(outPath, bytes);
      return { job, ok: true };
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
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

  let done = 0, skipped = 0, failed = [];
  const CONCURRENCY = 4;
  let idx = 0;

  async function worker() {
    while (idx < jobs.length) {
      const job = jobs[idx++];
      const result = await generateOne(job);
      if (result.skipped) skipped++;
      else if (result.ok) done++;
      else failed.push(result);
      const n = done + skipped + failed.length;
      process.stdout.write(`\r[${n}/${jobs.length}] generated=${done} skipped=${skipped} failed=${failed.length}   `);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log("\n");

  if (failed.length) {
    console.log(`${failed.length} clips failed after retries:`);
    failed.forEach((f) => console.log(`  ${f.job.id} (${JSON.stringify(f.job.text)}): ${f.error}`));
    console.log("Re-run the workflow to retry just the missing ones (already-saved files are skipped) — but note a fresh Actions run starts from an empty folder, so partial failures are only resumable within a local re-run.\n");
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
