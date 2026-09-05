#!/usr/bin/env python3
"""
Open-transcription content verification for the already-shipped official
audio clips (public/audio/official/*.mp3), using a real Amharic-specific
acoustic model instead of the general-purpose faster-whisper checkpoint
this project already tried and dropped (see scripts/verify_audio_content.py
and generate-official-audio.mjs's own long comment for that history:
open transcription with faster-whisper hallucinated into unrelated scripts
-- Hebrew, Telugu, Bengali, Kazakh Cyrillic, Burmese -- even with the
language forced to "am", and a follow-up closed-set-ranking experiment
against the same checkpoint still failed 13 of 14 sampled units).

aioxlabs/dvoice-amharic is a wav2vec2+CTC model actually trained on an
Amharic corpus (SpeechBrain's DVoice project), not a side effect of
massive multilingual training -- its published benchmark is a Character
Error Rate of ~6.71 and Word Error Rate of ~25.50, which is a real,
non-zero signal, unlike faster-whisper's near-total absence of one. That
published number is on its own benchmark, not this app's audio, so this
script still verifies empirically rather than trusting it -- exactly the
same posture that caught faster-whisper's failure last time.

This asks the harder, more direct question the faster-whisper closed-set
experiment specifically avoided: "what did this say?", then compares the
answer to the known canonical text with a similarity score, rather than
just asking "which of N known texts does this most resemble?". Both
numbers are reported (open-transcription similarity AND closed-set rank)
since a model that's actually decoding Amharic should do reasonably on
both, and disagreement between them is itself informative.

Rows are verified as a WHOLE reconstructed recitation (concatenating the
shipped per-letter slices back together), not per letter -- a lone
~0.3-0.6s syllable fragment is too little signal for any ASR model. This
can only speak to whether the row was recited correctly; it says nothing
about whether row-slicing put the boundaries in exactly the right places
(see scripts/row-slicing.mjs and its tests for that).

This is a DIAGNOSTIC, not an auto-fix: it writes a report and flags
low-similarity clips for a human to actually listen to and decide on --
it does not delete or regenerate anything itself. The margin/threshold
here have never been calibrated against a single real clip before this
script's first real run, so treat the very first report as a pilot to
sanity-check (do the "PASS" clips look like real matches, do the
"NEEDS_REVIEW" ones sound actually wrong when you listen to them) before
trusting the threshold for anything downstream.

Usage:
  python3 scripts/verify_audio_content_dvoice.py \
      --clips-dir public/audio/official \
      --texts scripts/verification-texts.json \
      --out scripts/verification-report-dvoice.json \
      [--pilot N] [--similarity-threshold 0.5]

--pilot N checks only the first N rows + N anchors + N phrases, to get a
cheap read on whether this model produces sane output at all before
paying for a full run across all ~74 units.
"""

import argparse
import difflib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

# Ethiopic punctuation + generic whitespace/punctuation stripped before
# scoring similarity, so a transcript that gets the words right but
# drops a comma/period doesn't read as "wrong" -- the raw transcription
# is still kept in the report untouched, so a human reviewing can see
# exactly what the model actually output.
_STRIP_RE = re.compile(r"[\s፣።፤፥፦፧,.!?]+")


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def normalize(text):
    return _STRIP_RE.sub("", text or "").strip()


def similarity(a, b):
    return difflib.SequenceMatcher(None, normalize(a), normalize(b)).ratio()


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


def to_wav16k_mono(src_path, out_path):
    # Converted explicitly rather than relying on transcribe_file's own
    # "auto-normalizes if needed" behavior -- that's undocumented enough
    # (from this sandbox, which can't reach huggingface.co to check the
    # library source directly) that it's safer to hand the model exactly
    # the format its README says it was trained on.
    result = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src_path),
         "-ac", "1", "-ar", "16000", str(out_path)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        return False, f"ffmpeg wav conversion failed: {result.stderr[:300]}"
    return True, None


def build_pool(units):
    return [(u["id"], u["text"]) for u in units]


def rank(transcription, pool):
    scored = sorted(
        ((uid, text, similarity(transcription, text)) for uid, text in pool),
        key=lambda t: t[2],
        reverse=True,
    )
    return scored


def verify_unit(asr_model, unit_id, expected_text, audio_path, pool, similarity_threshold, tmp_dir):
    wav_path = tmp_dir / f"{unit_id}.wav"
    ok, reason = to_wav16k_mono(audio_path, wav_path)
    if not ok:
        return {"id": unit_id, "verdict": "SKIPPED", "reason": reason}

    transcription = asr_model.transcribe_file(str(wav_path)).strip()
    open_sim = similarity(transcription, expected_text)

    scored = rank(transcription, pool)
    correct_rank = next(i for i, (uid, _, _) in enumerate(scored, start=1) if uid == unit_id)
    top_uid, top_text, top_sim = scored[0]

    verdict = "PASS" if open_sim >= similarity_threshold else "NEEDS_REVIEW"

    return {
        "id": unit_id,
        "expected_text": expected_text,
        "transcription": transcription,
        "open_similarity": round(open_sim, 4),
        "closed_set_rank": correct_rank,
        "closed_set_top_candidate": None if correct_rank == 1 else {"id": top_uid, "text": top_text, "similarity": round(top_sim, 4)},
        "verdict": verdict,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips-dir", required=True, type=Path)
    ap.add_argument("--texts", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--pilot", type=int, default=None, help="only check the first N rows/anchors/phrases")
    ap.add_argument("--model-source", default="aioxlabs/dvoice-amharic")
    ap.add_argument("--similarity-threshold", type=float, default=0.5,
                     help="below this open-transcription similarity, flag NEEDS_REVIEW (not auto-fixed)")
    args = ap.parse_args()

    texts = json.loads(args.texts.read_text())
    rows, anchors, phrases = texts["rows"], texts["anchors"], texts["phrases"]
    if args.pilot:
        rows, anchors, phrases = rows[: args.pilot], anchors[: args.pilot], phrases[: args.pilot]

    row_pool = build_pool(texts["rows"])
    word_pool = build_pool(texts["anchors"] + texts["phrases"])

    log(f"Loading {args.model_source} (SpeechBrain EncoderASR)...")
    # speechbrain.inference is the 1.0+ import path -- doesn't exist in
    # 0.5.16, which this is deliberately pinned to (see the workflow's own
    # comment: the model's hparams.yaml needs 0.5.16's pre-1.0 module
    # layout). 0.5.16's equivalent is speechbrain.pretrained.
    from speechbrain.pretrained import EncoderASR
    asr_model = EncoderASR.from_hparams(
        source=args.model_source,
        savedir=f"pretrained_models/{args.model_source.replace('/', '-')}",
    )

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
            r = verify_unit(asr_model, row["id"], row["text"], recon_path, row_pool, args.similarity_threshold, tmp)
            r["category"] = "row"
            results.append(r)
            log(f"[{row['id']}] {r['verdict']} — transcribed {r.get('transcription')!r}, sim={r.get('open_similarity')}")

        for unit, category in [(a, "anchor") for a in anchors] + [(p, "phrase") for p in phrases]:
            audio_path = args.clips_dir / unit["file"]
            if not audio_path.exists():
                log(f"[{unit['id']}] SKIP — clip not shipped (never verified at generation time)")
                results.append({"id": unit["id"], "category": category, "verdict": "SKIPPED", "reason": "clip not shipped"})
                continue
            log(f"[{unit['id']}] transcribing...")
            r = verify_unit(asr_model, unit["id"], unit["text"], audio_path, word_pool, args.similarity_threshold, tmp)
            r["category"] = category
            results.append(r)
            log(f"[{unit['id']}] {r['verdict']} — transcribed {r.get('transcription')!r}, sim={r.get('open_similarity')}")

    args.out.write_text(json.dumps(results, indent=2, ensure_ascii=False))

    counts = {}
    for r in results:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    log("")
    log(f"Summary: {counts}")
    flagged = [r for r in results if r["verdict"] == "NEEDS_REVIEW"]
    if flagged:
        log(f"\n{len(flagged)} clip(s) below the similarity threshold — listen to these before doing anything else:")
        for r in flagged:
            log(f"  {r['id']}: expected {r['expected_text']!r}, transcribed {r.get('transcription')!r}, sim={r.get('open_similarity')}")

    log(f"\nFull report written to {args.out}")
    log("\nThis is a diagnostic report, not an auto-fix -- nothing was deleted or regenerated. "
        "Review NEEDS_REVIEW clips by ear before deciding what to do with them.")


if __name__ == "__main__":
    main()
