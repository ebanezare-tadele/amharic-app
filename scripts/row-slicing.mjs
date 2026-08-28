// Pure boundary-selection logic for slicing a row clip into its
// syllables, split out of generate-official-audio.mjs so it's unit
// testable against real measured silence-gap data without spawning
// ffmpeg. See the comment above sliceRow() in that script for the full
// rationale (why "most prominent N gaps" beats "exactly N gaps at one
// fixed threshold").
//
// chooseRowBounds() only ever sees THREE distinct situations, and it's
// important callers don't blur them together when reporting confidence
// (a real bug here previously: every flagged row was reported as
// "even-split fallback" in the generation summary, even rows that had
// MORE real candidate gaps than needed and used real acoustic pauses
// for every cut — see scripts/row-slicing.test.mjs for the case that
// caught it):
//   - "exact": interior gap count === wanted. Every cut is a real pause.
//     Not flagged.
//   - "surplus": interior gap count > wanted. Every cut is still a real
//     pause (the N longest of the candidates) — just not a 1:1 mapping
//     to "one pause per boundary", so flagged for a human to spot-check,
//     not because the audio is likely wrong.
//   - "even-split": interior gap count < wanted, even at a permissive
//     detection threshold. No real evidence exists for at least one
//     boundary, so the clip is divided evenly by duration instead.
//     Flagged, and meaningfully lower-confidence than "surplus" — a cut
//     landing mid-syllable is a real risk here, not just a formality.
export function chooseRowBounds(interiorGaps, syllableCount, duration) {
  const wantGaps = syllableCount - 1;

  if (interiorGaps.length >= wantGaps) {
    const chosen = [...interiorGaps]
      .sort((a, b) => (b.end - b.start) - (a.end - a.start))
      .slice(0, wantGaps);
    const cuts = chosen.map((g) => (g.start + g.end) / 2).sort((a, b) => a - b);
    const points = [0, ...cuts, duration];
    const bounds = points.slice(0, -1).map((s, i) => [s, points[i + 1]]);
    const exact = interiorGaps.length === wantGaps;
    return {
      bounds,
      confidence: exact ? "exact" : "surplus",
      flagged: !exact,
      note: exact
        ? null
        : `${interiorGaps.length} candidate gaps found (wanted ${wantGaps}) — used the ${wantGaps} most prominent real pauses`,
    };
  }

  const step = duration / syllableCount;
  const bounds = Array.from({ length: syllableCount }, (_, i) => [i * step, (i + 1) * step]);
  return {
    bounds,
    confidence: "even-split",
    flagged: true,
    note: `only ${interiorGaps.length} real pause(s) detected (wanted ${wantGaps}) — fell back to an even split by duration, boundaries may not align with real syllable timing`,
  };
}
