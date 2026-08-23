import { supabase, supabaseConfigured } from "./supabaseClient.js";

const CACHE_KEY = "amharic-fidel:family-passcode-v1";

// Stored in plain text in this device's localStorage after the server
// verifies it once. That's an intentional trade-off, not an oversight:
// anyone with access to a family member's unlocked phone or laptop can
// already record over the shared clips in person, so caching the
// passcode there doesn't hand out anything a stranger could use — they'd
// need the browser it's cached in. What it protects against is a
// stranger who only has the URL.
export function getCachedPasscode() {
  try {
    return window.localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}

export function setCachedPasscode(passcode) {
  try {
    window.localStorage.setItem(CACHE_KEY, passcode);
  } catch {}
}

export function clearCachedPasscode() {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {}
}

export async function verifyPasscode(passcode) {
  if (!supabaseConfigured) return { ok: false, error: "Shared sync isn't configured yet." };
  const { data, error } = await supabase.functions.invoke("shared-audio", {
    body: { action: "verify", passcode },
  });
  if (error) return { ok: false, error: error.message || "Couldn't reach the server." };
  return data;
}
