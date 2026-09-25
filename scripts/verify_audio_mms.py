#!/usr/bin/env python3
"""
Second, independent content check for the shipped official clips, using
Meta's MMS speech-recognition model (facebook/mms-1b-all with its Amharic
adapter) -- a different architecture, different training data and
different team from aioxlabs/dvoice-amharic, which generate_edge_audio.py
already gates on. Agreement between the two is much stronger evidence
than either alone; disagreement is where a human should listen.

Reports, for every shipped clip:
  - words/phrases: similarity of the MMS transcript to the expected text
  - letter rows: similarity of the joined row, and how many letters,
    heard one at a time, came back with the right consonant

Usage:
  node scripts/export-verification-texts.mjs
  python3 scripts/verify_audio_mms.py --clips-dir public/audio/official \
      --out scripts/verification-report-mms.json
"""

import argparse
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import generate_edge_audio as g  # noqa: E402  (shared normalize/similarity/ffmpeg helpers)


class MmsAsr:
    def __init__(self, source="facebook/mms-1b-all", lang="amh"):
        import torch
        from transformers import AutoProcessor, Wav2Vec2ForCTC

        g.log(f"Loading {source} ({lang} adapter)...")
        self.torch = torch
        self.processor = AutoProcessor.from_pretrained(source, target_lang=lang)
        self.model = Wav2Vec2ForCTC.from_pretrained(source, target_lang=lang, ignore_mismatched_sizes=True)
        self.model.eval()

    def transcribe(self, audio_path, tmp):
        import numpy as np

        raw = tmp / (audio_path.stem + ".mms.f32")
        r = g.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(audio_path), "-ac", "1", "-ar", "16000",
                   "-f", "f32le", str(raw)])
        if r.returncode != 0:
            return None
        audio = np.fromfile(raw, dtype=np.float32)
        # Very short clips (a single syllable) get a little silence either
        # side; CTC models do poorly with no context frames at all.
        audio = np.concatenate([np.zeros(4000, np.float32), audio, np.zeros(4000, np.float32)])
        inputs = self.processor(audio, sampling_rate=16000, return_tensors="pt")
        with self.torch.no_grad():
            logits = self.model(**inputs).logits
        ids = self.torch.argmax(logits, dim=-1)[0]
        return self.processor.decode(ids).strip()


def consonant_hits(letters, transcripts):
    heard = [(l, t) for l, t in zip(letters, transcripts) if t]
    hits = sum(any(g.FAMILY.get(c) == g.FAMILY.get(l) for c in t) for l, t in heard)
    return hits, len(heard)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips-dir", type=Path, default=Path("public/audio/official"))
    ap.add_argument("--texts", type=Path, default=Path("scripts/verification-texts.json"))
    ap.add_argument("--out", type=Path, default=Path("scripts/verification-report-mms.json"))
    args = ap.parse_args()

    texts = json.loads(args.texts.read_text())
    rows = texts["rows"]
    for twin, common in g.TWINS.items():
        g.HOMOPHONE.update(zip(rows[twin]["letters"], rows[common]["letters"]))
    for i, row in enumerate(rows):
        for c in row["letters"]:
            g.FAMILY[c] = g.TWINS.get(i, i)

    shipped = set(json.loads((args.clips_dir / "manifest.json").read_text()))
    asr = MmsAsr()
    results = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for row in rows:
            pairs = [(l, f) for l, f in zip(row["letters"], row["letterFiles"]) if f in shipped]
            if not pairs:
                continue
            letters = [l for l, _ in pairs]
            files = [args.clips_dir / f for _, f in pairs]
            per = [asr.transcribe(f, tmp) for f in files]
            joined = tmp / f"{row['id']}.joined.wav"
            g.join_with_pauses(files, joined)
            heard = asr.transcribe(joined, tmp)
            expected = "፣ ".join(letters) + "።"
            sim = g.similarity(heard, expected)
            hits, n = consonant_hits(letters, per)
            results.append({"id": row["id"], "category": "row", "expected": expected, "transcription": heard,
                            "similarity": round(sim, 4), "consonant_hits": f"{hits}/{n}",
                            "letters": [{"letter": l, "transcription": t} for l, t in zip(letters, per)]})
            g.log(f"[{row['id']}] sim={sim:.2f} consonants={hits}/{n} heard {heard!r} "
                  + " ".join(f"{l}→{t}" for l, t in zip(letters, per)))
        for unit, cat in [(a, "anchor") for a in texts["anchors"]] + [(p, "phrase") for p in texts["phrases"]]:
            if unit["file"] not in shipped:
                continue
            heard = asr.transcribe(args.clips_dir / unit["file"], tmp)
            sim = g.similarity(heard, unit["text"])
            results.append({"id": unit["id"], "category": cat, "expected": unit["text"], "transcription": heard,
                            "similarity": round(sim, 4)})
            g.log(f"[{unit['id']}] sim={sim:.2f} expected {unit['text']!r} heard {heard!r}")

    args.out.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n")
    for cat in ("row", "anchor", "phrase"):
        sims = [r["similarity"] for r in results if r["category"] == cat]
        if sims:
            low = [r["id"] for r in results if r["category"] == cat and r["similarity"] < 0.5]
            g.log(f"{cat}: {len(sims)} checked, mean sim {sum(sims) / len(sims):.2f}, below 0.5: {low}")


if __name__ == "__main__":
    main()
