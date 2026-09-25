import { describe, it, expect } from "vitest";
import { WORD_FAM, officialAudioUrl, officialKeyFromFilename } from "./audio.js";

const BASE = "/amharic-app/";

describe("officialAudioUrl", () => {
  it("builds a row (letter) URL from fam/order", () => {
    expect(officialAudioUrl(12, 4, BASE)).toBe("/amharic-app/audio/official/letter-12-4.mp3");
  });

  it("builds an anchor-word URL using WORD_FAM.anchor", () => {
    expect(officialAudioUrl(WORD_FAM.anchor, 7, BASE)).toBe("/amharic-app/audio/official/anchor-7.mp3");
  });

  it("builds a phrase URL using WORD_FAM.phrase", () => {
    expect(officialAudioUrl(WORD_FAM.phrase, 3, BASE)).toBe("/amharic-app/audio/official/phrase-3.mp3");
  });

  it("respects a non-default base path", () => {
    expect(officialAudioUrl(0, 0, "/")).toBe("/audio/official/letter-0-0.mp3");
  });
});

describe("officialKeyFromFilename", () => {
  it("parses a row (letter) filename into a fam.order key", () => {
    expect(officialKeyFromFilename("letter-12-4.mp3")).toBe("12.4");
  });

  it("parses an anchor filename into a WORD_FAM.anchor key", () => {
    expect(officialKeyFromFilename("anchor-7.mp3")).toBe(`${WORD_FAM.anchor}.7`);
  });

  it("parses a phrase filename into a WORD_FAM.phrase key", () => {
    expect(officialKeyFromFilename("phrase-3.mp3")).toBe(`${WORD_FAM.phrase}.3`);
  });

  it("returns null for anything that isn't a recognized clip filename", () => {
    expect(officialKeyFromFilename("manifest.json")).toBeNull();
    expect(officialKeyFromFilename("letter-3.mp3")).toBeNull(); // missing order segment
    expect(officialKeyFromFilename("row-3-0.mp3")).toBeNull(); // wrong prefix
    expect(officialKeyFromFilename("")).toBeNull();
    expect(officialKeyFromFilename("vocab-weather-0.mp3")).toBeNull(); // no such topic
  });
});

describe("officialAudioUrl / officialKeyFromFilename round-trip", () => {
  // HearButton and Chant only ever offer the "official clip" tier for a
  // (fam, order) pair that appears as a key derived from manifest.json's
  // filenames. If these two functions ever drift out of sync, a manifest
  // entry could silently stop being playable (key parsed one way, URL
  // built another) with no visible error — this guards that.
  const filenames = [
    "letter-0-0.mp3", "letter-33-6.mp3",
    "anchor-0.mp3", "anchor-33.mp3",
    "phrase-0.mp3", "phrase-13.mp3",
    "vocab-time-0.mp3", "vocab-directions-17.mp3",
  ];

  it.each(filenames)("round-trips %s through key -> fam/order -> URL", (filename) => {
    const key = officialKeyFromFilename(filename);
    expect(key).not.toBeNull();
    const [fam, order] = key.split(".").map(Number);
    const url = officialAudioUrl(fam, order, BASE);
    expect(url.endsWith(`/${filename}`)).toBe(true);
  });
});

describe("vocab topics", () => {
  it("have unique pseudo-families above the fixed WORD_FAM ids, and unique ASCII ids", async () => {
    const { VOCAB } = await import("./vocab.js");
    const fams = VOCAB.map((v) => v.fam);
    expect(new Set(fams).size).toBe(fams.length);
    fams.forEach((f) => expect(f).toBeGreaterThan(Math.max(...Object.values(WORD_FAM))));
    VOCAB.forEach((v) => expect(v.id).toMatch(/^[a-z]+$/));
  });

  it("builds a vocab URL by topic id", () => {
    expect(officialAudioUrl(905, 2, BASE)).toBe("/amharic-app/audio/official/vocab-colors-2.mp3");
  });
});
