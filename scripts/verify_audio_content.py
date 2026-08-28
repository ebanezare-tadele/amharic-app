#!/usr/bin/env python3
"""
Closed-set content verification for the already-shipped official audio
clips (public/audio/official/*.mp3) — a different technique from the
open transcription this project already tried and dropped (see the long
comment atop generate-official-audio.mjs). That approach asked
faster-whisper "what did this say?" with no constraints, and it
hallucinated into unrelated scripts (Hebrew, Telugu, Bengali, Kazakh
Cyrillic, Burmese) even with the language forced to "am" -- evidence the
checkpoint has close to no real Amharic decoding ability in open-ended
generation.

This script asks an easier question instead: "which of these N known
candidate texts does this clip most resemble?" Even a transcription
model too weak to spell Amharic correctly may still be more similar
(character-for-character) to the true candidate than to any wrong one,
because the acoustic encoder is language-agnostic even where the
decoder's Amharic output is unreliable. If that signal exists, this
finds it without needing the model to get anything exactly right.

Rows are verified as a WHOLE reconstructed recitation (concatenating
the shipped per-letter slices back together), not per letter -- a
lone ~0.3-0.6s syllable fragment is too little signal for any ASR
model, closed-set or not. This can only speak to whether the row was
recited correctly; it says nothing about whether row-slicing put the
boundaries in the exactly right places (see scripts/row-slicing.mjs
and its tests for that).

Usage:
  python3 scripts/verify_audio_content.py \
      --clips-dir public/audio/official \
      --texts scripts/verification-texts.json \
      --out scripts/verification-report.json \
      [--pilot N] [--model medium]

--pilot N checks only the first N rows + N anchors + N phrases, to get
a cheap read on whether the closed-set signal exists at all before
paying for a full run across all ~74 units (each transcription takes
tens of seconds to a few minutes on a CPU runner with the "medium"
checkpoint).
"""

import argparse
import difflib
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def similarity(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()


def concat_row_audio(clips_dir, letter_files, out_path):
    paths = [clips_dir / f for f in letter_files]
    missing = [p.name for p in paths if not p.exists()]
    if missing:
        return False, f"missing slice(s): {missing}"
    list_file = out_path.with_suffix(".txt")
    list_file.write_text("".join(f"file '{p.resolve()}'\n" for p in paths))
    result = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", str(list_file), "-c", "copy", str(out_path)],
        capture_output=True, text=True,
    )
    list_file.unlink(missing_ok=True)
    if result.returncode != 0:
        return False, f"ffmpeg concat failed: {result.stderr[:300]}"
    return True, None


def build_pool(units):
    # units: list of {"id": ..., "text": ...} -- the closed-set candidate list.
    return [(u["id"], u["text"]) for u in units]


def rank(transcription, pool):
    scored = sorted(
        ((uid, text, similarity(transcription, text)) for uid, text in pool),
        key=lambda t: t[2],
        reverse=True,
    )
    return scored


def verify_unit(model, unit_id, expected_text, audio_path, pool, margin_threshold):
    segments, _info = model.transcribe(str(audio_path), language="am", beam_size=5, word_timestamps=False)
    transcription = "".join(s.text for s in segments).strip()

    scored = rank(transcription, pool)
    correct_rank = next(i for i, (uid, _, _) in enumerate(scored, start=1) if uid == unit_id)
    correct_sim = next(s for uid, _, s in scored if uid == unit_id)
    top_uid, top_text, top_sim = scored[0]

    if correct_rank == 1:
        runner_up_sim = scored[1][2] if len(scored) > 1 else 0.0
        margin = correct_sim - runner_up_sim
        verdict = "PASS" if margin >= margin_threshold else "AMBIGUOUS"
    else:
        margin = correct_sim - top_sim
        verdict = "FAIL"

    return {
        "id": unit_id,
        "expected_text": expected_text,
        "transcription": transcription,
        "correct_rank": correct_rank,
        "correct_similarity": round(correct_sim, 4),
        "top_candidate_id": top_uid,
        "top_candidate_text": top_text,
        "top_similarity": round(top_sim, 4),
        "margin": round(margin, 4),
        "verdict": verdict,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips-dir", required=True, type=Path)
    ap.add_argument("--texts", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--pilot", type=int, default=None, help="only check the first N rows/anchors/phrases")
    ap.add_argument("--model", default="medium")
    ap.add_argument("--margin-threshold", type=float, default=0.08)
    args = ap.parse_args()

    texts = json.loads(args.texts.read_text())
    rows, anchors, phrases = texts["rows"], texts["anchors"], texts["phrases"]
    if args.pilot:
        rows, anchors, phrases = rows[: args.pilot], anchors[: args.pilot], phrases[: args.pilot]

    row_pool = build_pool(texts["rows"])  # always the full 34-way pool, even in pilot mode
    word_pool = build_pool(texts["anchors"] + texts["phrases"])  # 48-way, catches cross-category confusion

    log(f"Loading faster-whisper '{args.model}' (language=am, forced)...")
    from faster_whisper import WhisperModel
    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    results = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        for row in rows:
            recon_path = tmp / f"{row['id']}.mp3"
            ok, reason = concat_row_audio(args.clips_dir, row["letterFiles"], recon_path)
            if not ok:
                log(f"[{row['id']}] SKIP — {reason}")
                results.append({"id": row["id"], "category": "row", "verdict": "SKIPPED", "reason": reason})
                continue
            log(f"[{row['id']}] transcribing reconstructed row...")
            r = verify_unit(model, row["id"], row["text"], recon_path, row_pool, args.margin_threshold)
            r["category"] = "row"
            results.append(r)
            log(f"[{row['id']}] {r['verdict']} — rank {r['correct_rank']}, sim={r['correct_similarity']}, margin={r['margin']}")

        for unit, category in [(a, "anchor") for a in anchors] + [(p, "phrase") for p in phrases]:
            audio_path = args.clips_dir / unit["file"]
            if not audio_path.exists():
                log(f"[{unit['id']}] SKIP — clip not shipped (never verified at generation time)")
                results.append({"id": unit["id"], "category": category, "verdict": "SKIPPED", "reason": "clip not shipped"})
                continue
            log(f"[{unit['id']}] transcribing...")
            r = verify_unit(model, unit["id"], unit["text"], audio_path, word_pool, args.margin_threshold)
            r["category"] = category
            results.append(r)
            log(f"[{unit['id']}] {r['verdict']} — rank {r['correct_rank']}, sim={r['correct_similarity']}, margin={r['margin']}")

    args.out.write_text(json.dumps(results, indent=2, ensure_ascii=False))

    counts = {}
    for r in results:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    log("")
    log(f"Summary: {counts}")
    fails = [r for r in results if r["verdict"] == "FAIL"]
    if fails:
        log(f"\n{len(fails)} FAIL(s) — closed-set ranking did not favor the correct text:")
        for r in fails:
            log(f"  {r['id']}: expected {r['expected_text']!r}, transcribed {r['transcription']!r}, "
                f"ranked #{r['correct_rank']} (top guess: {r['top_candidate_id']} {r['top_candidate_text']!r})")

    log(f"\nFull report written to {args.out}")


if __name__ == "__main__":
    main()
