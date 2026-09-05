// Optional cross-device sync for personal progress (xp/streak/mastery)
// and any letter/word recordings — no account, no email. A random code,
// generated on-device, is the only credential; see the progress_sync
// migration in the amharic-fidel Supabase project for how that's actually
// enforced server-side.
//
// Plain fetch() against Supabase's PostgREST RPC endpoint rather than the
// @supabase/supabase-js SDK — this only ever needs two RPC calls, and the
// full SDK (auth/realtime/storage clients included) added ~200KB to the
// app's bundle for that. Not secrets: see the comment this file used to
// have in supabaseClient.js, now folded in here — Supabase's publishable
// key is designed to be public, with row-level security on the actual
// table doing the real work.
const SUPABASE_URL = "https://mzbvnqunbcensahaohgo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Gm1jIrYLERtvPQ7nwCxUjg_9PhhOWLN";

async function rpc(fn, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Couldn't reach the server (${res.status}).${text ? " " + text.slice(0, 200) : ""}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const CODE_STORAGE_KEY = "amharic-fidel:sync-code";
// Excludes 0/O/1/I/L — easy to misread when copying a code by hand.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 10;

export function generateSyncCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function getSavedSyncCode() {
  try {
    return window.localStorage.getItem(CODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveSyncCode(code) {
  try {
    if (code) window.localStorage.setItem(CODE_STORAGE_KEY, code);
    else window.localStorage.removeItem(CODE_STORAGE_KEY);
  } catch {}
}

// Other people's sync codes this device wants to watch (opt-in progress
// compare) -- entirely separate from CODE_STORAGE_KEY above, which is
// this device's OWN code. Read-only: compare never calls applyBundle,
// so watching someone's code can't overwrite anything of theirs or
// yours.
const COMPARE_STORAGE_KEY = "amharic-fidel:compare-codes";

export function getCompareCodes() {
  try {
    const raw = window.localStorage.getItem(COMPARE_STORAGE_KEY);
    const codes = raw ? JSON.parse(raw) : [];
    return Array.isArray(codes) ? codes : [];
  } catch {
    return [];
  }
}

export function saveCompareCodes(codes) {
  try {
    window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(codes));
  } catch {}
}

export async function pullBundle(code) {
  return rpc("get_progress", { p_code: code }); // null if no row for that code
}

// Opt-in progress compare uses this instead of pullBundle -- a separate,
// read-only RPC (get_compare_stats, added specifically for this) that
// computes just {xp, streakDays, masteredCount} server-side, so watching
// someone's code for compare can never pull their recordings or raw
// progress map across the wire at all, unlike get_progress which returns
// literally everything stored under that code.
export async function pullCompareStats(code) {
  return rpc("get_compare_stats", { p_code: code }); // null if no row for that code
}

export async function pushBundle(code, bundle) {
  await rpc("put_progress", { p_code: code, p_state: bundle });
}

// Everything that's currently local-only and device-specific: lesson
// progress (fidel:v1) plus every recorded clip (aud:index and each
// family's aud:f<n> map). Reads straight from window.storage so this
// always reflects whatever's actually saved, not in-memory React state.
export async function gatherBundle() {
  const stateRes = await window.storage.get("fidel:v1");
  let progress = null;
  try {
    progress = stateRes && stateRes.value ? JSON.parse(stateRes.value) : null;
  } catch {}

  const idxRes = await window.storage.get("aud:index");
  let audIndex = [];
  try {
    audIndex = idxRes && idxRes.value ? JSON.parse(idxRes.value) : [];
  } catch {}

  const audClips = {};
  const seenFams = new Set();
  for (const k of audIndex) {
    const fam = k.split(".")[0];
    const storageKey = "aud:f" + fam;
    if (seenFams.has(storageKey)) continue;
    seenFams.add(storageKey);
    const r = await window.storage.get(storageKey);
    if (r && r.value) audClips[storageKey] = r.value;
  }

  return { progress, audIndex, audClips };
}

export async function applyBundle(bundle) {
  if (!bundle) return;
  if (bundle.progress) await window.storage.set("fidel:v1", JSON.stringify(bundle.progress));
  if (bundle.audIndex) await window.storage.set("aud:index", JSON.stringify(bundle.audIndex));
  if (bundle.audClips) {
    for (const [k, v] of Object.entries(bundle.audClips)) {
      await window.storage.set(k, v);
    }
  }
}
