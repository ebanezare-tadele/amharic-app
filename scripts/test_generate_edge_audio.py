#!/usr/bin/env python3
"""Checks for generate_edge_audio.py's text/consonant scoring, using real
transcripts from past runs. Run: python3 scripts/test_generate_edge_audio.py
(after node scripts/export-verification-texts.mjs)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import generate_edge_audio as g  # noqa: E402

rows = json.loads(Path("scripts/verification-texts.json").read_text())["rows"]
g.load_tables(rows)

CASES = [
    # (letter, transcript, expected) -- dvoice writes Ethiopic, MMS mostly Latin
    ("ደ", "ደ", True), ("ደ", "d", True),
    ("ዱ", "ጆ", False), ("ዱ", "zu", False),  # both models heard another consonant
    ("ሸ", "se", True),  # MMS writes ሸ as "s"
    ("ከ", "ka", True), ("ኩ", "c", True),  # ...and ከ often as "c"
    ("ቀ", "ታ", False),
    ("ስ", "ltheltl", False),  # MMS noise on a bare sixth-order consonant
    ("ሢ", "si", True), ("ሠ", "ሰ", True),  # silent twins match their homophone
    ("ዔ", "e", True), ("ዓ", "l", False),
    ("ጸ", "ts", True), ("ፀ", "ሱ", False),
    ("ለ", None, False), ("ለ", "", False),
]
failures = [(l, h, exp) for l, h, exp in CASES if g.consonant_match(l, h) != exp]

assert g.similarity("አይን", "ዓይን።") == 1.0, "homophones should compare equal"
assert g.similarity("ሀ ሁ ሂ ሃ ሄ ህ ሆ", rows[30]["text"]) == 1.0
assert g.similarity("አይን", "ኣይን") == 1.0, "አ and ኣ are the same sound"
assert g.similarity("ልጅ", "ልጅ።") == 1.0, "punctuation is ignored"

if failures:
    sys.exit(f"consonant_match failures: {failures}")
print(f"ok: {len(CASES)} consonant cases, 4 similarity cases")
