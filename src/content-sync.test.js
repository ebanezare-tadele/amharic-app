// src/content.js and scripts/content.mjs each keep their own copy of the
// letter-family/anchor-word/phrase text -- content.js's copy carries UI-only
// fields (romanization, notes) content.mjs doesn't need, so one importing
// the other wasn't a clean fit (see content.mjs's own comment). That
// means nothing stops the two from silently drifting apart if one is
// ever edited without the other -- this test is that stop: it fails
// loudly the moment they disagree on what a letter/word/phrase actually
// is, rather than only surfacing as a mismatch between what the app
// teaches and what the generated audio actually says.
import { describe, it, expect } from "vitest";
import { RAW as APP_RAW, ANCHORS as APP_ANCHORS, PHRASES as APP_PHRASES } from "./content.js";
import { RAW as GEN_RAW, ANCHORS as GEN_ANCHORS, PHRASES as GEN_PHRASES } from "../scripts/content.mjs";

describe("App.jsx content matches scripts/content.mjs (audio generation)", () => {
  it("RAW: same 34 families, same chars/consonant/display-name", () => {
    expect(APP_RAW.length).toBe(GEN_RAW.length);
    APP_RAW.forEach(([chars, cons, name], i) => {
      expect([chars, cons, name]).toEqual(GEN_RAW[i]);
    });
  });

  it("ANCHORS: same 34 words, in the same order", () => {
    expect(APP_ANCHORS.length).toBe(GEN_ANCHORS.length);
    APP_ANCHORS.forEach(([word], i) => {
      expect(word).toBe(GEN_ANCHORS[i]);
    });
  });

  it("PHRASES: same 14 phrases, in the same order", () => {
    expect(APP_PHRASES.length).toBe(GEN_PHRASES.length);
    APP_PHRASES.forEach(([phrase], i) => {
      expect(phrase).toBe(GEN_PHRASES[i]);
    });
  });
});
