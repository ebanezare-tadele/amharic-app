import { describe, it, expect, beforeEach, vi } from "vitest";

// Minimal stand-in for HTMLAudioElement: records every element created
// and lets a test finish or fail the current clip by hand.
let created;
class FakeAudio {
  constructor() {
    this.src = "";
    this.paused = true;
    this.onended = null;
    this.onerror = null;
    this.plays = [];
    created.push(this);
  }
  play() {
    this.paused = false;
    this.plays.push(this.src);
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

let fetched;
async function freshPlayer() {
  created = [];
  fetched = [];
  globalThis.Audio = FakeAudio;
  globalThis.fetch = vi.fn(async (url) => {
    fetched.push(url);
    return url.includes("missing") ? { ok: false } : { ok: true, blob: async () => url };
  });
  globalThis.URL.createObjectURL = (b) => `blob:${b}`;
  globalThis.window = { speechSynthesis: { cancel: vi.fn() } };
  vi.resetModules();
  return import("./player.js");
}

// playUrl fetches before it plays; wait for the element to start.
const started = (src) => vi.waitFor(() => expect(created.at(-1)?.plays.at(-1)).toBe(src));

describe("shared audio player", () => {
  let p;
  beforeEach(async () => {
    p = await freshPlayer();
  });

  it("reuses one element for every clip (iOS only unlocks per element)", async () => {
    p.unlockAudio();
    const first = p.playUrl("a.mp3");
    await started("blob:a.mp3");
    created[0].onended();
    expect(await first).toBe(true);
    const second = p.playUrl("b.mp3");
    await started("blob:b.mp3");
    created[0].onended();
    expect(await second).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].plays).toEqual([expect.stringMatching(/^data:audio\/wav/), "blob:a.mp3", "blob:b.mp3"]);
  });

  it("fetches each clip whole once, so the service worker can cache it", async () => {
    for (let i = 0; i < 2; i++) {
      const r = p.playUrl("a.mp3");
      await started("blob:a.mp3");
      created[0].onended();
      await r;
    }
    expect(fetched).toEqual(["a.mp3"]);
  });

  it("plays recorded data: URLs directly, without fetching", async () => {
    const r = p.playUrl("data:audio/webm;base64,AAAA");
    await started("data:audio/webm;base64,AAAA");
    created[0].onended();
    expect(await r).toBe(true);
    expect(fetched).toEqual([]);
  });

  it("unlocks only once", () => {
    p.unlockAudio();
    p.unlockAudio();
    expect(created[0].plays).toHaveLength(1);
  });

  it("a new clip stops the previous one, which resolves false", async () => {
    const first = p.playUrl("a.mp3");
    await started("blob:a.mp3");
    const second = p.playUrl("b.mp3");
    expect(await first).toBe(false);
    await started("blob:b.mp3");
    created[0].onended();
    expect(await second).toBe(true);
  });

  it("a stop while the clip is still downloading means it never starts", async () => {
    const first = p.playUrl("a.mp3");
    p.stopAudio();
    expect(await first).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("stopAudio pauses, settles the pending clip and cancels speech", async () => {
    const first = p.playUrl("a.mp3");
    await started("blob:a.mp3");
    p.stopAudio();
    expect(await first).toBe(false);
    expect(created[0].paused).toBe(true);
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });

  it("a clip that fails to load resolves false", async () => {
    expect(await p.playUrl("missing.mp3")).toBe(false);
    const r = p.playUrl("a.mp3");
    await started("blob:a.mp3");
    created[0].onerror();
    expect(await r).toBe(false);
  });

  it("a rejected play() (blocked autoplay) resolves false", async () => {
    FakeAudio.prototype.play = function () {
      return Promise.reject(new Error("NotAllowedError"));
    };
    try {
      expect(await p.playUrl("a.mp3")).toBe(false);
    } finally {
      FakeAudio.prototype.play = function () {
        this.paused = false;
        this.plays.push(this.src);
        return Promise.resolve();
      };
    }
  });
});
