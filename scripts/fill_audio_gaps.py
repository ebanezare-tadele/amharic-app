#!/usr/bin/env python3
"""
Fill gaps in public/audio/official/ without touching anything already
there. The clips already shipped have been listened to and approved, so
this only ever ADDS files and manifest entries.

Two kinds of gap:

1. Letters with no clip (their row failed, or the letter was dropped).
   Each is tried with both voices at three speeds, and ships only on a
   stricter rule than the one the existing rows passed: on the SAME clip,
   dvoice-amharic must write a letter of the right family AND MMS must
   hear the right consonant. Two independent recognizers agreeing on one
   clip is the evidence; a letter only one of them hears stays out. The
   sixth order is skipped: a bare consonant is too short for either model
   to read on its own, so it can't meet this rule.

2. Words with no clip, i.e. the More tab's topic lists (src/vocab.js):
   same rule and retries as the anchor words (generate_edge_audio.do_word).

Usage (normally via .github/workflows/fill-audio-gaps.yml):
  node scripts/export-verification-texts.mjs
  python3 scripts/fill_audio_gaps.py
"""

import argparse
import asyncio
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import generate_edge_audio as g  # noqa: E402

VARIANTS = [(v, r) for r in ("-10%", "-30%", "+0%") for v in g.VOICES]


async def try_letter(letter, final, asr, mms, tmp):
    tried = []
    for voice, rate in VARIANTS:
        clip = tmp / final.name
        dur, err = await g.make_clip(g.HOMOPHONE.get(letter, letter), voice, rate, "letter", clip, tmp)
        entry = {"voice": voice, "rate": rate, "duration": dur}
        if err:
            entry["error"] = err
            tried.append(entry)
            continue
        dv, mm = asr.transcribe(clip, tmp), mms.transcribe(clip, tmp)
        entry.update({"dvoice": dv, "mms": mm, "dvoice_ok": g.consonant_match(letter, dv),
                      "mms_ok": g.consonant_match(letter, mm)})
        tried.append(entry)
        if entry["dvoice_ok"] and entry["mms_ok"]:
            shutil.copyfile(clip, final)
            return True, tried
    return False, tried


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--texts", type=Path, default=Path("scripts/verification-texts.json"))
    ap.add_argument("--clips-dir", type=Path, default=Path("public/audio/official"))
    ap.add_argument("--report", type=Path, default=Path("scripts/gap-fill-report.json"))
    args = ap.parse_args()

    texts = json.loads(args.texts.read_text())
    g.load_tables(texts["rows"])
    manifest_path = args.clips_dir / "manifest.json"
    shipped = set(json.loads(manifest_path.read_text()))

    asr, mms = g.Asr(), g.MmsAsr()
    results = []
    added = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for row in texts["rows"]:
            for order, (letter, name) in enumerate(zip(row["letters"], row["letterFiles"])):
                if name in shipped or order == 5:
                    continue
                ok, tried = await try_letter(letter, args.clips_dir / name, asr, mms, tmp)
                results.append({"id": name, "letter": letter, "verdict": "PASS" if ok else "FAIL", "attempts": tried})
                if ok:
                    added.append(name)
                last = tried[-1] if tried else {}
                g.log(f"[{letter} {name}] {'PASS' if ok else 'FAIL'} after {len(tried)} "
                      f"(last: dvoice {last.get('dvoice')!r} mms {last.get('mms')!r})")

        for unit in texts.get("vocab", []):
            if unit["file"] in shipped:
                continue
            r = await g.do_word(unit, "vocab", asr, mms, args.clips_dir, tmp)
            results.append(r)
            if r["verdict"] == "PASS":
                added.append(unit["file"])
            last = r["attempts"][-1] if r["attempts"] else {}
            g.log(f"[{unit['id']}] {r['verdict']} expected {unit['text']!r} heard {last.get('transcription')!r} "
                  f"sim={last.get('similarity')} mms={last.get('mms')!r}")

    # Existing entries are kept exactly as they were; this only adds.
    manifest_path.write_text(json.dumps(sorted(shipped | set(added)), indent=2) + "\n")
    args.report.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n")
    letters = [r for r in results if "letter" in r]
    words = [r for r in results if "letter" not in r]
    g.log(f"\nLetters: {sum(r['verdict'] == 'PASS' for r in letters)}/{len(letters)} filled; "
          f"words: {sum(r['verdict'] == 'PASS' for r in words)}/{len(words)} filled; "
          f"manifest now {len(shipped | set(added))} clips")


if __name__ == "__main__":
    asyncio.run(main())
