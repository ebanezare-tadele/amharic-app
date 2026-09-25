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

async function freshPlayer() {
  created = [];
  globalThis.Audio = FakeAudio;
  globalThis.window = { speechSynthesis: { cancel: vi.fn() } };
  vi.resetModules();
  return import("./player.js");
}

describe("shared audio player", () => {
  let p;
  beforeEach(async () => {
    p = await freshPlayer();
  });

  it("reuses one element for every clip (iOS only unlocks per element)", async () => {
    p.unlockAudio();
    const first = p.playUrl("a.mp3");
    created[0].onended();
    expect(await first).toBe(true);
    const second = p.playUrl("b.mp3");
    created[0].onended();
    expect(await second).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].plays).toEqual([expect.stringMatching(/^data:audio\/wav/), "a.mp3", "b.mp3"]);
  });

  it("unlocks only once", () => {
    p.unlockAudio();
    p.unlockAudio();
    expect(created[0].plays).toHaveLength(1);
  });

  it("a new clip stops the previous one, which resolves false", async () => {
    const first = p.playUrl("a.mp3");
    const second = p.playUrl("b.mp3");
    expect(await first).toBe(false);
    created[0].onended();
    expect(await second).toBe(true);
  });

  it("stopAudio pauses, settles the pending clip and cancels speech", async () => {
    const first = p.playUrl("a.mp3");
    p.stopAudio();
    expect(await first).toBe(false);
    expect(created[0].paused).toBe(true);
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });

  it("a clip that fails to load resolves false", async () => {
    const r = p.playUrl("missing.mp3");
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
