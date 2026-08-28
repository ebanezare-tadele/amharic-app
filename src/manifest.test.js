import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { officialKeyFromFilename } from "./audio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OFFICIAL_DIR = path.join(__dirname, "..", "public", "audio", "official");
const MANIFEST_PATH = path.join(OFFICIAL_DIR, "manifest.json");

// These run against whatever is actually committed under
// public/audio/official/ — the real thing the deployed app serves, not a
// fixture. If this directory hasn't been populated yet (e.g. a fresh
// clone before the generation workflow has ever run), every test here is
// skipped rather than failing, since "no audio shipped yet" is a valid
// state, not a bug.
const manifestExists = existsSync(MANIFEST_PATH);
const d = manifestExists ? describe : describe.skip;

d("public/audio/official manifest integrity", () => {
  const manifest = manifestExists ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) : [];
  const actualFiles = manifestExists
    ? new Set(readdirSync(OFFICIAL_DIR).filter((n) => n.endsWith(".mp3")))
    : new Set();

  it("is a JSON array", () => {
    expect(Array.isArray(manifest)).toBe(true);
  });

  it("has no duplicate entries", () => {
    expect(new Set(manifest).size).toBe(manifest.length);
  });

  it("every listed filename matches a recognized clip pattern", () => {
    const unrecognized = manifest.filter((name) => officialKeyFromFilename(name) === null);
    expect(unrecognized).toEqual([]);
  });

  it("every listed filename actually exists on disk", () => {
    const missing = manifest.filter((name) => !actualFiles.has(name));
    expect(missing).toEqual([]);
  });

  it("every listed clip is a non-trivial mp3 file (not empty, not truncated)", () => {
    // 500 bytes is well under the smallest real clip (~5.4KB observed in
    // production) but well above what a zero-byte or single-frame-error
    // file would produce — catches corruption without false-flagging a
    // legitimately short anchor word.
    const tooSmall = manifest.filter((name) => {
      const p = path.join(OFFICIAL_DIR, name);
      return !existsSync(p) || statSync(p).size < 500;
    });
    expect(tooSmall).toEqual([]);
  });

  it("no orphaned mp3 files exist outside the manifest", () => {
    // A file present on disk but not in manifest.json would be dead
    // weight at best; at worst it means generation and manifest-writing
    // fell out of sync and the app is silently missing something it
    // could have offered.
    const orphans = [...actualFiles].filter((name) => !manifest.includes(name));
    expect(orphans).toEqual([]);
  });
});
