#!/usr/bin/env python3
"""
Generate the app's official pronunciation clips with Microsoft's neural
Amharic voices (via edge-tts: free, no API key), then ship ONLY what an
Amharic-trained speech-recognition model confirms actually says the
right thing.

Why this replaces the Addis AI pipeline (generate-official-audio.mjs):
the dvoice-amharic verification run against the shipped Addis clips
showed the failure directly -- short inputs came back as long, unrelated
utterances (expected "ልጅ።", heard "ቆቸ መጀስተ"; expected "ሰላም።", heard a
twelve-word sentence), while longer phrases passed. That's the signature
of a generative (LLM-style) TTS model hallucinating on out-of-distribution
input. Azure's neural voices are not generative in that sense -- they
render the input text's phonemes and nothing else -- so they can mispronounce,
but they can't invent a sentence. The verification below checks that
empirically rather than trusting it.

Letters are synthesized one glyph per call. The earlier edge-tts pilot
(scripts/pilot-edge-tts-row.mjs) showed a whole-row recitation comes back
with no audible pauses at the Ethiopic commas (0 of 6 gaps found), so
slicing a row isn't viable with this engine -- and per-letter synthesis
doesn't need it.

Verification, per unit:
  1. Duration: the trimmed clip must land in a sane band for its category.
     A hallucinated or padded clip fails this regardless of content.
  2. Content: aioxlabs/dvoice-amharic (wav2vec2+CTC trained on Amharic)
     transcribes it, and the transcript must be similar enough to the
     expected text. Words/phrases are checked one by one. A lone
     syllable is too little signal for any ASR model, so a letter row is
     checked as its 7 clips joined with short pauses -- the same
     reconstructed-row approach verify_audio_content_dvoice.py uses.
A unit that fails is retried with the other voice, then at a slower
rate. Anything that never passes is simply left out of manifest.json,
and the app never offers it.

Usage (normally run by .github/workflows/generate-edge-audio.yml):
  node scripts/export-verification-texts.mjs
  python3 scripts/generate_edge_audio.py --out scripts/official-audio-out [--pilot N]
"""

import argparse
import asyncio
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

VOICES = ["am-ET-MekdesNeural", "am-ET-AmehaNeural"]
# (voice, rate) attempts in order; a unit keeps the first that verifies.
ATTEMPTS = [(VOICES[0], "-10%"), (VOICES[1], "-10%"), (VOICES[0], "-30%"), (VOICES[1], "-30%")]

# Trimmed-speech duration bands, seconds. Generous on purpose: they exist
# to catch a clip that's grossly wrong (empty, or a whole invented
# sentence), not to police speaking rate.
BANDS = {"letter": (0.12, 1.6), "anchor": (0.25, 2.8), "phrase": (0.35, 4.5)}

SIMILARITY_THRESHOLD = {"row": 0.5, "anchor": 0.5, "phrase": 0.5}

_STRIP_RE = re.compile(r"[\s፣።፤፥፦፧,.!?]+")


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def normalize(text):
    return _STRIP_RE.sub("", text or "").strip()


def similarity(a, b):
    return difflib.SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def probe_duration(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    try:
        return float(r.stdout.strip())
    except ValueError:
        return None


# Trim leading/trailing silence (reverse, trim, reverse back), keep a
# short natural tail, and re-encode to small mono mp3.
_TRIM = (
    "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
    "areverse,"
    "silenceremove=start_periods=1:start_silence=0.08:start_threshold=-45dB,"
    "areverse"
)


def trim_encode(src, dst):
    r = run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-af", _TRIM,
             "-ac", "1", "-ar", "24000", "-b:a", "48k", str(dst)])
    return r.returncode == 0


def to_wav16k(src, dst):
    return run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "16000", str(dst)]).returncode == 0


def join_with_pauses(srcs, dst, pause=0.35):
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for s in srcs:
        args += ["-i", str(s)]
    chains = "".join(
        f"[{i}:a]aresample=16000,aformat=channel_layouts=mono,apad=pad_dur={pause}[a{i}];" for i in range(len(srcs))
    )
    labels = "".join(f"[a{i}]" for i in range(len(srcs)))
    args += ["-filter_complex", f"{chains}{labels}concat=n={len(srcs)}:v=0:a=1[out]", "-map", "[out]", str(dst)]
    return run(args).returncode == 0


async def synthesize(text, voice, rate, out_path):
    import edge_tts

    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    last = None
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, voice, rate=rate, proxy=proxy).save(str(out_path))
            if out_path.exists() and out_path.stat().st_size > 0:
                return True
        except Exception as e:  # network hiccups / throttling
            last = e
        await asyncio.sleep(2 ** attempt)
    log(f"    synthesis failed for {text!r} ({voice}, {rate}): {last}")
    return False


class Asr:
    def __init__(self, source="aioxlabs/dvoice-amharic"):
        # speechbrain pinned to 0.5.16 (see the workflow) -- the model's
        # hparams.yaml needs that pre-1.0 module layout.
        from speechbrain.pretrained import EncoderASR

        log(f"Loading {source}...")
        self.model = EncoderASR.from_hparams(source=source, savedir=f"pretrained_models/{source.replace('/', '-')}")

    def transcribe(self, audio_path, tmp):
        wav = tmp / (audio_path.stem + ".16k.wav")
        if not to_wav16k(audio_path, wav):
            return None
        return self.model.transcribe_file(str(wav)).strip()


async def make_clip(text, voice, rate, category, final_path, tmp):
    raw = tmp / (final_path.stem + ".raw.mp3")
    if not await synthesize(text, voice, rate, raw):
        return None, "synthesis failed"
    if not trim_encode(raw, final_path):
        return None, "ffmpeg trim failed"
    dur = probe_duration(final_path)
    lo, hi = BANDS[category]
    if dur is None or not (lo <= dur <= hi):
        return dur, f"duration {dur}s outside {lo}-{hi}s"
    return dur, None


async def do_word(unit, category, asr, out_dir, tmp):
    final = out_dir / unit["file"]
    tried = []
    for voice, rate in ATTEMPTS:
        dur, err = await make_clip(unit["text"], voice, rate, category, final, tmp)
        entry = {"voice": voice, "rate": rate, "duration": dur}
        if err:
            entry["error"] = err
            tried.append(entry)
            continue
        heard = asr.transcribe(final, tmp)
        sim = similarity(heard, unit["text"])
        entry.update({"transcription": heard, "similarity": round(sim, 4)})
        tried.append(entry)
        if sim >= SIMILARITY_THRESHOLD[category]:
            return {"id": unit["id"], "category": category, "verdict": "PASS", "files": [unit["file"]], "attempts": tried}
    final.unlink(missing_ok=True)
    return {"id": unit["id"], "category": category, "verdict": "FAIL", "expected": unit["text"], "attempts": tried}


async def do_row(row, asr, out_dir, tmp):
    finals = [out_dir / f for f in row["letterFiles"]]
    tried = []
    for voice, rate in ATTEMPTS:
        entry = {"voice": voice, "rate": rate, "letters": []}
        ok = True
        for letter, final in zip(row["letters"], finals):
            dur, err = await make_clip(letter, voice, rate, "letter", final, tmp)
            lr = {"letter": letter, "duration": dur}
            if err:
                lr["error"] = err
                ok = False
            entry["letters"].append(lr)
        if not ok:
            tried.append(entry)
            continue
        # Per-letter transcripts are recorded for a human reading the
        # report; the pass/fail decision is on the joined row.
        for lr, final in zip(entry["letters"], finals):
            lr["transcription"] = asr.transcribe(final, tmp)
        joined = tmp / f"{row['id']}.joined.wav"
        if not join_with_pauses(finals, joined):
            entry["error"] = "ffmpeg join failed"
            tried.append(entry)
            continue
        heard = asr.transcribe(joined, tmp)
        sim = similarity(heard, row["text"])
        entry.update({"transcription": heard, "similarity": round(sim, 4)})
        tried.append(entry)
        if sim >= SIMILARITY_THRESHOLD["row"]:
            return {"id": row["id"], "category": "row", "verdict": "PASS", "files": row["letterFiles"], "attempts": tried}
    for f in finals:
        f.unlink(missing_ok=True)
    return {"id": row["id"], "category": "row", "verdict": "FAIL", "expected": row["text"], "attempts": tried}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--texts", type=Path, default=Path("scripts/verification-texts.json"))
    ap.add_argument("--out", type=Path, default=Path("scripts/official-audio-out"))
    ap.add_argument("--pilot", type=int, default=None, help="only the first N rows/anchors/phrases")
    args = ap.parse_args()

    texts = json.loads(args.texts.read_text())
    rows, anchors, phrases = texts["rows"], texts["anchors"], texts["phrases"]
    if args.pilot:
        rows, anchors, phrases = rows[: args.pilot], anchors[: args.pilot], phrases[: args.pilot]

    args.out.mkdir(parents=True, exist_ok=True)
    asr = Asr()
    results = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for row in rows:
            r = await do_row(row, asr, args.out, tmp)
            last = r["attempts"][-1] if r["attempts"] else {}
            log(f"[{row['id']}] {r['verdict']} expected {row['text']!r} heard {last.get('transcription')!r} sim={last.get('similarity')} ({len(r['attempts'])} attempt(s))")
            results.append(r)
        for unit, category in [(a, "anchor") for a in anchors] + [(p, "phrase") for p in phrases]:
            r = await do_word(unit, category, asr, args.out, tmp)
            last = r["attempts"][-1] if r["attempts"] else {}
            log(f"[{unit['id']}] {r['verdict']} expected {unit['text']!r} heard {last.get('transcription')!r} sim={last.get('similarity')} ({len(r['attempts'])} attempt(s))")
            results.append(r)

    manifest = sorted(f for r in results if r["verdict"] == "PASS" for f in r["files"])
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (args.out / "report.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n")

    by_cat = {}
    for r in results:
        c = by_cat.setdefault(r["category"], {"PASS": 0, "FAIL": 0})
        c[r["verdict"]] += 1
    log(f"\nSummary: {json.dumps(by_cat)}")
    log(f"{len(manifest)} clip file(s) verified and listed in manifest.json")
    for r in results:
        if r["verdict"] == "FAIL":
            log(f"  FAIL {r['id']}: expected {r['expected']!r}")


if __name__ == "__main__":
    asyncio.run(main())
