// Backs the `shared` (scope="all") half of the app's window.storage calls
// with Supabase, so family recordings sync across everyone's devices
// instead of staying in one browser's localStorage.
//
// This module only ever sees the two key shapes the app's audio code
// (App.jsx's putClip/readMap/loadAudIndex) actually uses in shared mode:
//   "aud:shared-index"  -> JSON array of "fam.order" strings
//   "aud:f<fam>"        -> JSON object of { order: url } for one family
//
// The table `shared_recordings` (fam, ord) is the real source of truth;
// "aud:shared-index" is derived from it on every read rather than stored,
// so a stale/partial write to it can't leave the two out of sync.
//
// Writes are the interesting part: App.jsx's putClip/deleteClip both work
// by reading the current per-family map, changing one entry, and writing
// the *whole map* back. We tell a fresh recording (still a local
// `data:` URL, not yet uploaded) apart from an unchanged one (already a
// `https://` Supabase Storage URL, since that's what our own GET returns)
// purely by that prefix — no extra bookkeeping needed.

import { supabase, supabaseConfigured } from "./supabaseClient.js";
import { getCachedPasscode } from "./familyPasscode.js";

const BUCKET = "recordings";

function publicUrlFor(storagePath) {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

async function fetchIndex() {
  const { data, error } = await supabase.from("shared_recordings").select("fam, ord");
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchFamilyMap(fam) {
  const { data, error } = await supabase
    .from("shared_recordings")
    .select("ord, storage_path")
    .eq("fam", fam);
  if (error) throw new Error(error.message);
  const map = {};
  for (const row of data || []) map[row.ord] = publicUrlFor(row.storage_path);
  return map;
}

async function callFunction(body) {
  const { data, error } = await supabase.functions.invoke("shared-audio", { body });
  if (error) throw new Error(error.message || "Shared-audio request failed.");
  if (!data || data.ok !== true) throw new Error((data && data.error) || "Shared-audio request failed.");
  return data;
}

async function putClip(fam, ord, dataUrl) {
  const passcode = getCachedPasscode();
  if (!passcode) throw new Error("No family passcode cached.");
  await callFunction({ action: "put", passcode, fam, ord, dataUrl });
}

async function deleteClip(fam, ord) {
  const passcode = getCachedPasscode();
  if (!passcode) throw new Error("No family passcode cached.");
  await callFunction({ action: "delete", passcode, fam, ord });
}

export async function sharedGet(key) {
  if (key === "aud:shared-index") {
    const rows = await fetchIndex();
    return { value: JSON.stringify(rows.map((r) => `${r.fam}.${r.ord}`)) };
  }
  if (key.startsWith("aud:f")) {
    const fam = Number(key.slice("aud:f".length));
    const map = await fetchFamilyMap(fam);
    return { value: JSON.stringify(map) };
  }
  return { value: null };
}

export async function sharedSet(key, value) {
  if (key === "aud:shared-index") {
    // Derived from shared_recordings on every read — nothing to persist.
    return;
  }
  if (key.startsWith("aud:f")) {
    const fam = Number(key.slice("aud:f".length));
    const incoming = JSON.parse(value) || {};
    const remote = await fetchFamilyMap(fam);

    const removed = Object.keys(remote).filter((ord) => !(ord in incoming));
    const changed = Object.entries(incoming).filter(([, url]) => url.startsWith("data:"));

    await Promise.all([
      ...removed.map((ord) => deleteClip(fam, Number(ord))),
      ...changed.map(([ord, url]) => putClip(fam, Number(ord), url)),
    ]);
    return;
  }
}

export async function sharedDelete(key) {
  if (key.startsWith("aud:f")) {
    const fam = Number(key.slice("aud:f".length));
    const remote = await fetchFamilyMap(fam);
    await Promise.all(Object.keys(remote).map((ord) => deleteClip(fam, Number(ord))));
  }
}

export { supabaseConfigured };
