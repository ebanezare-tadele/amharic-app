/*
 * Polyfill for `window.storage`, the get/set/delete API that only exists
 * inside a Claude.ai artifact sandbox. Everything here is personal to this
 * browser — lesson progress, streak, mastery, xp, and any letter/word
 * recordings — and lives in this device's own localStorage.
 */

const NS = "amharic-fidel:personal:";

window.storage = {
  async get(key) {
    try {
      return { value: window.localStorage.getItem(NS + key) };
    } catch {
      return { value: null };
    }
  },

  async set(key, value) {
    try {
      window.localStorage.setItem(NS + key, value);
    } catch {
      // Quota exceeded or storage unavailable — fail silently, same as the
      // artifact sandbox's own failure mode that App.jsx already catches
      // around every storage call.
    }
  },

  async delete(key) {
    try {
      window.localStorage.removeItem(NS + key);
    } catch {}
  },
};
