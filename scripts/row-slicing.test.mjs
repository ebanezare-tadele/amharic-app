import { describe, it, expect } from "vitest";
import { chooseRowBounds } from "./row-slicing.mjs";

// Real silencedetect output from production run 32775210400 (generate-audio.yml,
// 2026-08-24), not synthetic data — see scripts/generate-official-audio.mjs's
// top-of-file comment on why this project measures before guessing at a fix.
// Each case is one row's actual interior gaps (already edge-filtered) for a
// 7-syllable row (wantGaps = 6).

function gaps(pairs) {
  return pairs.map(([start, end]) => ({ start, end }));
}

describe("chooseRowBounds — real production cases", () => {
  it("row_0: only 3 real gaps for 6 wanted -> even-split, flagged, low confidence", () => {
    // silencedetect (duration=2.90s): [[0,0.24],[0.49,0.80],[1.63,1.83],[2.05,2.24],[2.47,2.86]]
    // edge-filtered (EDGE=0.14s on a 2.90s clip) to the interior 3.
    const interior = gaps([[0.49, 0.80], [1.63, 1.83], [2.05, 2.24]]);
    const result = chooseRowBounds(interior, 7, 2.90);
    expect(result.confidence).toBe("even-split");
    expect(result.flagged).toBe(true);
    expect(result.bounds).toHaveLength(7);
    // Even split: every segment should be duration/7, not derived from a gap.
    const step = 2.90 / 7;
    result.bounds.forEach(([s, e], i) => {
      expect(s).toBeCloseTo(i * step, 5);
      expect(e).toBeCloseTo((i + 1) * step, 5);
    });
  });

  it("row_2: 8 real gaps for 6 wanted -> picks the 6 most prominent, flagged but real pauses", () => {
    // silencedetect (duration=4.65s): 10 raw gaps, edge-filtered to these 8 interior ones.
    const interior = gaps([
      [0.93, 1.08], [1.33, 1.42], [1.61, 1.99], [2.46, 2.55],
      [2.76, 2.93], [3.16, 3.26], [3.45, 3.74], [3.99, 4.12],
    ]);
    const result = chooseRowBounds(interior, 7, 4.65);
    expect(result.confidence).toBe("surplus");
    expect(result.flagged).toBe(true);
    expect(result.bounds).toHaveLength(7);
    // Every cut boundary must be the midpoint of one of the 6 LONGEST
    // candidate gaps, not an arbitrary/even split — this is what
    // distinguishes "surplus" (real pauses used) from "even-split" (no
    // real evidence). Gap durations here are 0.15, 0.09, 0.38, 0.09,
    // 0.17, 0.10, 0.29, 0.13 — the two shortest (both 0.09s: 1.33-1.42
    // and 2.46-2.55) must be the ones dropped.
    const droppedMidpoints = [(1.33 + 1.42) / 2, (2.46 + 2.55) / 2];
    const cutPoints = result.bounds.slice(1).map(([s]) => s);
    droppedMidpoints.forEach((m) => {
      expect(cutPoints.some((c) => Math.abs(c - m) < 1e-9)).toBe(false);
    });
  });

  it("row_4: exactly 6 real gaps for 6 wanted -> exact match, not flagged", () => {
    // silencedetect (duration=3.03s): edge-filtered to exactly 6 interior gaps.
    const interior = gaps([
      [1.02, 1.15], [1.31, 1.39], [1.54, 1.67], [1.81, 1.93], [2.00, 2.14], [2.35, 2.46],
    ]);
    const result = chooseRowBounds(interior, 7, 3.03);
    expect(result.confidence).toBe("exact");
    expect(result.flagged).toBe(false);
    expect(result.note).toBeNull();
    expect(result.bounds).toHaveLength(7);
    // Every boundary is exactly the midpoint of one of the given gaps.
    const midpoints = interior.map((g) => (g.start + g.end) / 2).sort((a, b) => a - b);
    const cutPoints = result.bounds.slice(1).map(([s]) => s);
    expect(cutPoints).toHaveLength(6);
    cutPoints.forEach((c, i) => expect(c).toBeCloseTo(midpoints[i], 9));
  });
});

describe("chooseRowBounds — structural invariants", () => {
  it("always returns syllableCount segments covering [0, duration] with no gaps or overlaps", () => {
    const cases = [
      { interior: gaps([]), syllableCount: 7, duration: 3.0 },
      { interior: gaps([[1, 1.1]]), syllableCount: 7, duration: 3.0 },
      { interior: gaps([[0.5, 0.6], [1.0, 1.1], [1.5, 1.6], [2.0, 2.1], [2.5, 2.6], [2.8, 2.9]]), syllableCount: 7, duration: 3.0 },
    ];
    for (const { interior, syllableCount, duration } of cases) {
      const { bounds } = chooseRowBounds(interior, syllableCount, duration);
      expect(bounds).toHaveLength(syllableCount);
      expect(bounds[0][0]).toBe(0);
      expect(bounds[bounds.length - 1][1]).toBe(duration);
      for (let i = 1; i < bounds.length; i++) {
        expect(bounds[i][0]).toBe(bounds[i - 1][1]);
      }
    }
  });

  it("excludes low-value noise candidates when real prominent gaps are also present", () => {
    const interior = gaps([
      [0.50, 0.80], // prominent, real (0.30s)
      [0.95, 1.02], // noise (0.07s)
      [1.20, 1.27], // noise (0.07s)
      [1.45, 1.52], // noise (0.07s)
      [1.64, 1.83], // prominent, real (0.19s)
      [2.06, 2.24], // prominent, real (0.18s)
      [0.30, 0.33], // noise (0.03s)
      [2.40, 2.43], // noise (0.03s)
    ]);
    const result = chooseRowBounds(interior, 7, 2.90);
    expect(result.confidence).toBe("surplus");
    const cutPoints = result.bounds.slice(1).map(([s]) => s);
    // The 3 prominent gaps' midpoints must all be present.
    [[0.50, 0.80], [1.64, 1.83], [2.06, 2.24]].forEach(([s, e]) => {
      expect(cutPoints.some((c) => Math.abs(c - (s + e) / 2) < 1e-9)).toBe(true);
    });
  });
});
