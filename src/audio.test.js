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
  });
});

describe("officialAudioUrl / officialKeyFromFilename round-trip", () => {
  // Not currently wired into any UI (see audio.js's own comment), but the
  // generation/verification scripts still rely on this URL <-> key mapping
  // staying consistent -- if these two functions ever drift out of sync, a
  // manifest entry could resolve to the wrong file with no visible error.
  // This guards that contract.
  const filenames = [
    "letter-0-0.mp3", "letter-33-6.mp3",
    "anchor-0.mp3", "anchor-33.mp3",
    "phrase-0.mp3", "phrase-13.mp3",
  ];

  it.each(filenames)("round-trips %s through key -> fam/order -> URL", (filename) => {
    const key = officialKeyFromFilename(filename);
    expect(key).not.toBeNull();
    const [fam, order] = key.split(".").map(Number);
    const url = officialAudioUrl(fam, order, BASE);
    expect(url.endsWith(`/${filename}`)).toBe(true);
  });
});
