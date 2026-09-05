// Personal recorded-clip storage (Voice) -- record a letter or word once
// and it plays back everywhere that letter/word appears (HearButton,
// Chant, Chart, Reader). Keyed the same way progress cards are: "fam.order".
// No React here; used by several components, so factored out on its own
// rather than tied to Voice specifically.

const audCache = new Map();
const AUD_IDX_KEY = "aud:index";

// have = Set of "fam.order" strings with a personal recording saved.
export async function loadAudIndex() {
  try {
    const r = await window.storage.get(AUD_IDX_KEY);
    return new Set(JSON.parse(r.value));
  } catch (e) {
    return new Set();
  }
}

async function readMap(f) {
  try {
    const r = await window.storage.get("aud:f" + f);
    return JSON.parse(r.value) || {};
  } catch (e) {
    return {};
  }
}

export async function getClip(f, o) {
  const ck = `${f}.${o}`;
  if (audCache.has(ck)) return audCache.get(ck);
  const m = await readMap(f);
  Object.entries(m).forEach(([oo, v]) => audCache.set(`${f}.${oo}`, v));
  return m[o] || null;
}

export async function putClip(f, o, url) {
  const m = await readMap(f);
  m[o] = url;
  await window.storage.set("aud:f" + f, JSON.stringify(m));
  audCache.set(`${f}.${o}`, url);
  const idx = await loadAudIndex();
  idx.add(`${f}.${o}`);
  await window.storage.set(AUD_IDX_KEY, JSON.stringify([...idx]));
  return idx;
}

// Anyone should be able to pull back something they recorded — including by
// mistake, or a clip they've decided they don't want anymore.
export async function deleteClip(f, o) {
  const m = await readMap(f);
  delete m[o];
  await window.storage.set("aud:f" + f, JSON.stringify(m));
  audCache.delete(`${f}.${o}`);
  const idx = await loadAudIndex();
  idx.delete(`${f}.${o}`);
  await window.storage.set(AUD_IDX_KEY, JSON.stringify([...idx]));
  return idx;
}
