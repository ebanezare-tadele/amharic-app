#!/usr/bin/env python3
"""
A second, independent open-transcription check against the already-shipped
official clips (public/audio/official/*.mp3), using a different Amharic
acoustic model from scripts/verify_audio_content_dvoice.py -- same idea
(open transcription against a model actually trained on Amharic, not
general-purpose faster-whisper, which had near-zero real signal for this
language -- see that script's own long comment for the full history), but
via badrex/w2v-bert-2.0-ethiopian-asr instead of aioxlabs/dvoice-amharic.
(Named "amharic-asr" in an earlier commit during development -- a real
run 404'd on that exact name; the model was consolidated into this
multilingual "ethiopian-asr" repo, which explicitly includes Amharic
alongside Tigrinya/Afaan Oromo/Sidama/Wolaytta.)

Two independent models is deliberate, not redundant: this one is a plain
Wav2Vec2BertForCTC checkpoint loaded through vanilla `transformers`
(Wav2Vec2BertProcessor + Wav2Vec2BertForCTC), with none of the SpeechBrain
version-pinning fragility the dvoice-amharic script needed (SpeechBrain
1.0 reorganized the module path the *model's own config* still expects
from a pre-1.0 release, plus an undeclared "requests" dependency, plus an
inference-API import path that moved between SpeechBrain versions -- three
real, separate bugs hit getting that script running). If the two models
disagree on a clip, that disagreement is itself useful signal; if they
agree, that is much stronger evidence than either one alone.

This is a DIAGNOSTIC, not an auto-fix: it writes a report and flags
low-similarity clips for a human to actually listen to and decide on --
it does not delete or regenerate anything itself.

Usage:
  python3 scripts/verify_audio_content_badrex.py \
      --clips-dir public/audio/official \
      --texts scripts/verification-texts.json \
      --out scripts/verification-report-badrex.json \
      [--pilot N] [--similarity-threshold 0.5]
"""

import argparse
import difflib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

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
    return sorted(
        ((uid, text, similarity(transcription, text)) for uid, text in pool),
        key=lambda t: t[2],
        reverse=True,
    )


def transcribe(processor, model, torch, wav_path):
    import torchaudio
    audio, sr = torchaudio.load(str(wav_path))
    inputs = processor(audio.squeeze(), sampling_rate=sr, return_tensors="pt")
    with torch.no_grad():
        logits = model(**inputs).logits
    pred_ids = torch.argmax(logits, dim=-1)
    return processor.batch_decode(pred_ids)[0].strip()


def verify_unit(processor, model, torch, unit_id, expected_text, audio_path, pool, similarity_threshold, tmp_dir):
    wav_path = tmp_dir / f"{unit_id}.wav"
    ok, reason = to_wav16k_mono(audio_path, wav_path)
    if not ok:
        return {"id": unit_id, "verdict": "SKIPPED", "reason": reason}

    transcription = transcribe(processor, model, torch, wav_path)
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
    ap.add_argument("--pilot", type=int, default=None)
    ap.add_argument("--model-source", default="badrex/w2v-bert-2.0-ethiopian-asr")
    ap.add_argument("--similarity-threshold", type=float, default=0.5)
    args = ap.parse_args()

    texts = json.loads(args.texts.read_text())
    rows, anchors, phrases = texts["rows"], texts["anchors"], texts["phrases"]
    if args.pilot:
        rows, anchors, phrases = rows[: args.pilot], anchors[: args.pilot], phrases[: args.pilot]

    row_pool = build_pool(texts["rows"])
    word_pool = build_pool(texts["anchors"] + texts["phrases"])

    log(f"Loading {args.model_source} (transformers Wav2Vec2BertForCTC)...")
    import torch
    from transformers import Wav2Vec2BertProcessor, Wav2Vec2BertForCTC
    processor = Wav2Vec2BertProcessor.from_pretrained(args.model_source)
    model = Wav2Vec2BertForCTC.from_pretrained(args.model_source)
    model.eval()

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
            r = verify_unit(processor, model, torch, row["id"], row["text"], recon_path, row_pool, args.similarity_threshold, tmp)
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
            r = verify_unit(processor, model, torch, unit["id"], unit["text"], audio_path, word_pool, args.similarity_threshold, tmp)
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
