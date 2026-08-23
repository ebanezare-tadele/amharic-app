/*
 * Polyfill for `window.storage`, the get/set/delete API that only exists
 * inside a Claude.ai artifact sandbox. This backs it with localStorage so
 * the app component itself doesn't need to change.
 *
 * Caveats (see README):
 * - Personal ("me") and shared ("all") data are just two different key
 *   prefixes in the SAME browser's localStorage — nothing is actually
 *   shared between people or devices. The "Everyone" recordings feature
 *   in the app will only work per-browser until this is backed by a real
 *   server.
 * - localStorage has a per-origin quota (usually 5-10MB). Audio clips are
 *   stored as base64 data URLs, so this will fill up well before the
 *   nominal 700KB-per-clip cap in the app is reached across many letters.
 */

const NS = "amharic-fidel:";

function storageKey(key, shared) {
  return NS + (shared ? "shared:" : "personal:") + key;
}

window.storage = {
  async get(key, shared) {
    try {
      const value = window.localStorage.getItem(storageKey(key, shared));
      return { value };
    } catch (e) {
      return { value: null };
    }
  },

  async set(key, value, shared) {
    try {
      window.localStorage.setItem(storageKey(key, shared), value);
    } catch (e) {
      // Quota exceeded or storage unavailable — fail silently, same as
      // the artifact sandbox's own failure mode that App.jsx already
      // catches around every storage call.
    }
  },

  async delete(key, shared) {
    try {
      window.localStorage.removeItem(storageKey(key, shared));
    } catch (e) {}
  },
};
