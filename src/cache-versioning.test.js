import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "vite.config.js");

// Regression test for a real production bug: commit b80b603 baked a first
// batch of official audio clips (prone to TTS hallucination) into
// public/audio/official/ under filenames like anchor-3.mp3. A later
// commit (026abab) replaced them with better-verified clips under the
// EXACT SAME filenames. The service worker's CacheFirst strategy for
// those .mp3 URLs never revalidates a cached response, so any browser
// that had played a clip during the bad window kept serving the old,
// wrong audio forever — invisibly, since nothing errors, it just plays
// the wrong thing — even after the correct files were live on the
// server. Renaming the cache is what actually invalidates that.
//
// This doesn't (and can't) prove the cache is correct at runtime — it's
// a static guard against reintroducing the literal poisoned cache name
// the next time a run of official audio needs to be replaced under
// unchanged filenames without remembering to bump this.
describe("official-audio cache versioning", () => {
  const config = readFileSync(CONFIG_PATH, "utf8");

  function extractCacheName(pattern) {
    const idx = config.search(pattern);
    if (idx === -1) return null;
    const slice = config.slice(idx, idx + 400);
    const m = /cacheName:\s*['"]([^'"]+)['"]/.exec(slice);
    return m ? m[1] : null;
  }

  it("the official-audio mp3 CacheFirst rule is not named the original poisoned cache", () => {
    const name = extractCacheName(/audio\/official\/.*\.mp3/);
    expect(name).not.toBeNull();
    expect(name).not.toBe("official-audio");
  });

  it("the official-audio mp3 cache name is versioned (ends in -vN)", () => {
    const name = extractCacheName(/audio\/official\/.*\.mp3/);
    expect(name).toMatch(/-v\d+$/);
  });
});
