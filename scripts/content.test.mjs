import { describe, it, expect } from "vitest";
import { RAW, ANCHORS, PHRASES, QUESTION_PHRASES, rowText, anchorText, phraseText } from "./content.mjs";

// Regression guard for extracting this out of generate-official-audio.mjs
// (and duplicating none of it in scripts/verify_audio_content.py) — a
// silent change here would change what every future generation run asks
// Addis AI to say, and what the content verifier checks against.

describe("content shape", () => {
  it("has the expected counts: 34 rows, 34 anchors, 14 phrases", () => {
    expect(RAW).toHaveLength(34);
    expect(ANCHORS).toHaveLength(34);
    expect(PHRASES).toHaveLength(14);
  });

  it("every row is exactly 7 syllables", () => {
    RAW.forEach(([chars]) => expect(Array.from(chars)).toHaveLength(7));
  });
});

describe("rowText", () => {
  it("joins syllables with an Ethiopic comma and ends with a full stop", () => {
    expect(rowText(0)).toBe("ለ፣ ሉ፣ ሊ፣ ላ፣ ሌ፣ ል፣ ሎ።");
  });
});

describe("anchorText", () => {
  it("appends a full stop to the word", () => {
    expect(anchorText(0)).toBe("ልጅ።");
  });
});

describe("phraseText", () => {
  it("appends a question mark for genuine questions", () => {
    QUESTION_PHRASES.forEach((i) => {
      expect(phraseText(i).endsWith("?")).toBe(true);
    });
  });

  it("appends a full stop for statements", () => {
    PHRASES.forEach((_, i) => {
      if (!QUESTION_PHRASES.has(i)) expect(phraseText(i).endsWith("።")).toBe(true);
    });
  });
});
