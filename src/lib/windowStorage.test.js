// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import "./windowStorage.js";

// Regression test for a real bug: window.storage.set()/delete() used to
// catch quota/storage errors and resolve anyway, silently discarding the
// failure. Every real caller (Voice's record/delete in App.jsx,
// flushSave) has its own try/catch specifically built to handle this
// failing -- swallowing it here meant a recording (or lesson progress)
// could vanish with the UI never told the save didn't happen. See the
// comment in windowStorage.js itself for the full story.

describe("window.storage.set", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("resolves normally on a successful write", async () => {
    await expect(window.storage.set("k", "v")).resolves.toBeUndefined();
    expect(await window.storage.get("k")).toEqual({ value: "v" });
  });

  it("rejects (does not silently swallow) when localStorage.setItem throws", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    await expect(window.storage.set("k", "v")).rejects.toThrow();
    spy.mockRestore();
  });
});

describe("window.storage.delete", () => {
  it("rejects when localStorage.removeItem throws", async () => {
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    await expect(window.storage.delete("k")).rejects.toThrow();
    spy.mockRestore();
  });
});

describe("window.storage.get", () => {
  it("still resolves to { value: null } on a read failure (not this bug's concern)", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(window.storage.get("missing")).resolves.toEqual({ value: null });
    spy.mockRestore();
  });
});
