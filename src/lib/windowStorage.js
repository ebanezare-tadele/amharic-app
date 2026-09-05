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
    // Quota exceeded or storage unavailable — let this reject rather than
    // swallowing it. Every real caller (Voice's record/delete, flushSave)
    // already has a try/catch built specifically to handle this failing;
    // silently resolving here was defeating all of that, letting a
    // recording (or lesson progress) disappear with the UI never told
    // the save didn't happen.
    window.localStorage.setItem(NS + key, value);
  },

  async delete(key) {
    window.localStorage.removeItem(NS + key);
  },
};
