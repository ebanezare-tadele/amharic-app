import { describe, it, expect } from "vitest";
import { spellInFidel } from "./transliterate.js";

// These pin down THIS algorithm's own defined behavior (consonant sounds by
// FAMS' cons field, vowel letters by the ORDERS mapping in content.js) --
// not a claim that this is the one correct or official Amharic spelling of
// any of these words. English spelling is irregular enough that a purely
// mechanical mapping won't match every real-world convention, and isn't
// meant to.

describe("spellInFidel", () => {
  it("splits a simple consonant-vowel-consonant word", () => {
    expect(spellInFidel("jack")).toEqual([
      [{ glyph: "ጃ", rom: "ja" }, { glyph: "ክ", rom: "k" }],
    ]);
  });

  it("maps the short-o and trailing bare consonant", () => {
    expect(spellInFidel("tom")).toEqual([
      [{ glyph: "ቶ", rom: "to" }, { glyph: "ም", rom: "m" }],
    ]);
  });

  it("recognizes the sh digraph as one consonant sound", () => {
    expect(spellInFidel("shane")).toEqual([
      [{ glyph: "ሻ", rom: "sha" }, { glyph: "ኔ", rom: "ne" }],
    ]);
  });

  it("gives a leading vowel its own glyph from the vowel-only family", () => {
    expect(spellInFidel("alex")).toEqual([
      [
        { glyph: "ኣ", rom: "a" },
        { glyph: "ሌ", rom: "le" },
        { glyph: "ክ", rom: "k" },
        { glyph: "ስ", rom: "s" },
      ],
    ]);
  });

  it("handles multiple words as separate entries", () => {
    expect(spellInFidel("david smith")).toEqual([
      [{ glyph: "ዳ", rom: "da" }, { glyph: "ቪ", rom: "vi" }, { glyph: "ድ", rom: "d" }],
      [{ glyph: "ስ", rom: "s" }, { glyph: "ሚ", rom: "mi" }, { glyph: "ት", rom: "t" }],
    ]);
  });

  it("strips punctuation and merges adjacent vowel letters into one syllable", () => {
    expect(spellInFidel("O'Brien")).toEqual([
      [
        { glyph: "ኦ", rom: "o" },
        { glyph: "ብ", rom: "b" },
        { glyph: "ሪ", rom: "ri" },
        { glyph: "ን", rom: "n" },
      ],
    ]);
  });

  it("returns nothing for blank or punctuation-only input", () => {
    expect(spellInFidel("")).toEqual([]);
    expect(spellInFidel("   ")).toEqual([]);
    expect(spellInFidel("!!!")).toEqual([]);
  });
});
