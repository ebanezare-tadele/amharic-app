/*
 * Polyfill for `window.storage`, the get/set/delete API that only exists
 * inside a Claude.ai artifact sandbox. App.jsx calls it two ways:
 *
 *   window.storage.get/set/delete(key)          -- personal scope
 *   window.storage.get/set/delete(key, true)    -- shared scope
 *
 * Personal scope (lesson progress, streak, mastery, xp) always goes to
 * this browser's own localStorage — that's a reasonable place for
 * single-device progress to live.
 *
 * Shared scope is only ever used for the "Everyone" family recordings
 * (see App.jsx's Voice/Chart components), and those need to actually
 * sync across different people's devices, which localStorage fundamentally
 * can't do. When Supabase is configured (VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY set — see README), shared calls are routed to
 * src/lib/sharedAudioStore.js instead, which talks to a Postgres table +
 * Storage bucket through a passcode-gated Edge Function for writes.
 *
 * If Supabase isn't configured (e.g. running locally before you've set
 * it up), shared scope falls back to a separate localStorage namespace —
 * the app stays fully usable, "Everyone" recordings just stay local to
 * that one browser until you wire up Supabase.
 */

import { supabaseConfigured } from "./supabaseClient.js";
import { sharedGet, sharedSet, sharedDelete } from "./sharedAudioStore.js";

const NS = "amharic-fidel:";

function storageKey(key, shared) {
  return NS + (shared ? "shared-fallback:" : "personal:") + key;
}

function localGet(key, shared) {
  try {
    return { value: window.localStorage.getItem(storageKey(key, shared)) };
  } catch {
    return { value: null };
  }
}

function localSet(key, value, shared) {
  try {
    window.localStorage.setItem(storageKey(key, shared), value);
  } catch {
    // Quota exceeded or storage unavailable — fail silently, same as the
    // artifact sandbox's own failure mode that App.jsx already catches
    // around every storage call.
  }
}

function localDelete(key, shared) {
  try {
    window.localStorage.removeItem(storageKey(key, shared));
  } catch {}
}

window.storage = {
  async get(key, shared) {
    if (shared && supabaseConfigured) {
      try {
        return await sharedGet(key);
      } catch {
        return { value: null };
      }
    }
    return localGet(key, shared);
  },

  async set(key, value, shared) {
    // Failures here are intentionally NOT caught — they propagate to the
    // caller (App.jsx's Voice component already catches this and shows
    // "Couldn't save that clip.").
    if (shared && supabaseConfigured) return sharedSet(key, value);
    return localSet(key, value, shared);
  },

  async delete(key, shared) {
    if (shared && supabaseConfigured) return sharedDelete(key);
    return localDelete(key, shared);
  },
};
