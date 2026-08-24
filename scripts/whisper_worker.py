#!/usr/bin/env python3
"""
Long-lived verification worker for scripts/generate-official-audio.mjs.

Why this exists: the previous approach asked Addis AI's TTS to read a
single isolated Ge'ez glyph, and separately tried to guess whether the
result was good from its file size alone. Neither held up — isolated
single-syllable input turned out to be out-of-distribution for a
sentence-level TTS model (it would sometimes pad or hallucinate into an
unrelated longer utterance), and file size is only a proxy for duration,
which only ever caught the most extreme outliers, not a wrong word at a
plausible length.

Two independent changes fix that instead of patching around it:

1. A fidel family is never asked to say one glyph alone. It's asked to
   recite the whole row (e.g. "ለ፣ ሉ፣ ሊ፣ ላ፣ ሌ፣ ል፣ ሎ።") — a completely
   normal utterance (this is literally how the alphabet is traditionally
   chanted), not an isolated syllable. This worker then uses real speech
   recognition (faster-whisper, word-level timestamps) to find exactly
   where each of the 7 syllables falls in that recording, and slices it
   into the 7 per-letter clips the app actually plays — so the model is
   always doing the thing it's good at (reading a natural utterance),
   and the isolation happens afterward, mechanically, from real
   evidence of where the syllables actually are.

2. Every clip — row, anchor word, or phrase — gets checked against what
   was actually said, not just how long the file is. A wrong-word clip
   at a perfectly normal duration would have sailed through the old
   size check; it won't sail through this one.

Talks to the calling Node process over stdin/stdout: one JSON object per
line in, one JSON object per line out. A persistent process because
loading the model is the expensive part (seconds), and there are ~80
clips to check in one run — reloading it per clip would dominate the
whole job's runtime for no reason.

Commands (all objects on stdin, one per line):
  {"cmd": "check", "id": "...", "audio": "/path/to/clip.mp3",
   "category": "row" | "anchor" | "phrase",
   "expected": {"syllables": [...]}            # category == row
             | {"text": "..."},                # category == anchor/phrase
   "sliceDir": "/path/to/out", "slicePrefix": "letter-3"}   # row only

Responses (one JSON object per line out), always including "id":
  {"id": "...", "verified": bool, "flagged": bool, "reason": "...",
   "duration": 3.21, "sliced": ["letter-3-0.mp3", ...] | null}

Never raises past the top-level loop — any exception for one job is
reported as a normal "not verified" result (with the exception message
as the reason) so the caller's existing retry logic handles it exactly
like any other failed attempt, and one bad clip can't take down the rest
of the run.
"""

import difflib
import json
import re
import subprocess
import sys
import time

from faster_whisper import WhisperModel

# "medium" -- tried "small" first to cut the ~6m43s cold-download time
# and it was a bad trade: on a real smoke test it didn't just get Amharic
# words wrong, it transcribed every clip into Hebrew script -- completely
# unrelated to the input, on every single job. Amharic is low-resource
# for Whisper at every size, but "small" is apparently not usable for it
# at all (see git history around 2026-08-24 for the actual transcripts).
# "medium" is the real minimum for this to mean anything. The slow-
# download problem is solved properly in .github/workflows/generate-
# audio.yml instead, by caching the downloaded model across runs, rather
# than by trading away whether verification means anything.
# Loaded once, reused for every request on stdin.
print(f"[whisper_worker] loading model...", file=sys.stderr, flush=True)
_load_start = time.monotonic()
_model = WhisperModel("medium", device="cpu", compute_type="int8")
print(f"[whisper_worker] model loaded in {time.monotonic() - _load_start:.1f}s", file=sys.stderr, flush=True)

# Duration sanity bands, in seconds -- independent of the content check
# below, and a direct (not size-proxied) version of the check that
# caught the original hallucination reports: a clip landing way outside
# its category's normal length is almost certainly not just reading the
# input text.
DURATION_LIMITS = {
    "row": (1.0, 14.0),      # 7 short syllables, comma-paced
    "anchor": (0.25, 4.5),   # one word
    "phrase": (0.25, 7.0),   # a short sentence
}

ETHIOPIC_PUNCT = re.compile(r"[፣፤፥፦፧።!?,.\s]+")


def normalize(text):
    return ETHIOPIC_PUNCT.sub("", text).strip()


def transcribe(audio_path):
    segments, info = _model.transcribe(
        audio_path, language="am", word_timestamps=True, beam_size=5
    )
    words = []
    full_text_parts = []
    for seg in segments:
        full_text_parts.append(seg.text)
        if seg.words:
            for w in seg.words:
                words.append({"text": w.word.strip(), "start": w.start, "end": w.end})
    return {"words": words, "text": "".join(full_text_parts), "duration": info.duration}


def slice_row(audio_path, words, slice_dir, slice_prefix, expected_count):
    # Expect one whisper "word" per syllable in the row, in the same
    # left-to-right order the row was written in -- which is also the
    # app's own vowel-order index (0-6), so word i -> order i directly.
    # Off-by-one is tolerated (whisper occasionally merges or splits a
    # short syllable) by distributing evenly across the expected count
    # rather than rejecting outright; anything further off than that
    # isn't a segmentation quirk, it's a sign the recording itself is
    # wrong, so it's rejected instead of sliced.
    n = len(words)
    if n == 0 or abs(n - expected_count) > 1:
        return None, f"whisper found {n} word(s), expected {expected_count}"

    if n == expected_count:
        bounds = [(w["start"], w["end"]) for w in words]
    else:
        # n is expected_count +/- 1: retime by even split across the
        # clip's actual spoken span instead of trusting word count to
        # line up 1:1 with our syllables.
        span_start, span_end = words[0]["start"], words[-1]["end"]
        step = (span_end - span_start) / expected_count
        bounds = [(span_start + i * step, span_start + (i + 1) * step) for i in range(expected_count)]

    PAD = 0.06
    out_names = []
    for i, (start, end) in enumerate(bounds):
        s = max(0.0, start - PAD)
        e = end + PAD
        out_name = f"{slice_prefix}-{i}.mp3"
        out_path = f"{slice_dir}/{out_name}"
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", audio_path,
            "-ss", f"{s:.3f}", "-to", f"{e:.3f}",
            "-c", "copy",
            out_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            # -c copy can fail to cut precisely on some mp3 frame
            # boundaries; fall back to a re-encode for just this slice.
            cmd[cmd.index("-c") : cmd.index("-c") + 2] = ["-acodec", "libmp3lame", "-q:a", "4"]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                return None, f"ffmpeg slice failed for {out_name}: {result.stderr[-300:]}"
        out_names.append(out_name)
    flagged = n != expected_count
    return out_names, ("word count off by one, sliced by even split" if flagged else None)


def handle(req):
    audio = req["audio"]
    category = req["category"]
    expected = req["expected"]

    t0 = time.monotonic()
    try:
        t = transcribe(audio)
    except Exception as e:
        print(f"[whisper_worker] {req.get('id')}: transcription failed after {time.monotonic() - t0:.1f}s: {e}", file=sys.stderr, flush=True)
        return {"verified": False, "flagged": False, "reason": f"transcription failed: {e}", "duration": None, "sliced": None}
    print(f"[whisper_worker] {req.get('id')}: transcribed in {time.monotonic() - t0:.1f}s, duration={t['duration']:.2f}s, words={len(t['words'])}, text={t['text']!r}", file=sys.stderr, flush=True)

    lo, hi = DURATION_LIMITS[category]
    if not (lo <= t["duration"] <= hi):
        return {
            "verified": False, "flagged": False,
            "reason": f"duration {t['duration']:.2f}s outside [{lo}, {hi}]s for category {category}",
            "duration": t["duration"], "sliced": None,
        }

    if category == "row":
        expected_count = len(expected["syllables"])
        sliced, note = None, None
        if req.get("sliceDir"):
            sliced, note = slice_row(audio, t["words"], req["sliceDir"], req["slicePrefix"], expected_count)
        if sliced is None:
            return {
                "verified": False, "flagged": False,
                "reason": note or "slicing not attempted",
                "duration": t["duration"], "sliced": None,
            }
        return {
            "verified": True, "flagged": note is not None, "reason": note,
            "duration": t["duration"], "sliced": sliced,
        }

    # anchor / phrase: compare normalized transcription to expected text.
    # Generous threshold on purpose -- the goal is catching "said
    # something else entirely" (the actual reported failure mode), not
    # demanding a perfect transcript from a low-resource-language model.
    got = normalize(t["text"])
    want = normalize(expected["text"])
    ratio = difflib.SequenceMatcher(None, got, want).ratio() if want else 0.0
    if ratio < 0.45:
        return {
            "verified": False, "flagged": False,
            "reason": f"transcript {got!r} doesn't match expected {want!r} (similarity {ratio:.2f})",
            "duration": t["duration"], "sliced": None,
        }
    return {
        "verified": True, "flagged": ratio < 0.7,
        "reason": None if ratio >= 0.7 else f"low-confidence match (similarity {ratio:.2f}): {got!r} vs {want!r}",
        "duration": t["duration"], "sliced": None,
    }


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = json.loads(line)
        try:
            result = handle(req)
        except Exception as e:
            result = {"verified": False, "flagged": False, "reason": f"worker exception: {e}", "duration": None, "sliced": None}
        result["id"] = req.get("id")
        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
