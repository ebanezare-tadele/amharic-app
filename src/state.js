// Persistence (window.storage-backed) and spaced-repetition helpers.
// No React here -- kept separate so this logic is trivially testable
// and so components/*.jsx don't need to know how progress is stored.

import { WORDS, EXTRA_WORDS } from "./content.js";

export const key = (f, o) => `${f}.${o}`;
export const INTERVALS = [0, 1, 2, 4, 9, 20, 45]; // days
export const DAY = 86400000;

export function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

export function pick(arr, n) {
  return shuffle(arr).slice(0, n);
}

export function allWords() {
  return WORDS.concat(typeof EXTRA_WORDS !== "undefined" ? EXTRA_WORDS : []);
}

export function wordsFor(unlockedChars) {
  return allWords().filter((w) => Array.from(w[0]).every((c) => unlockedChars.has(c)));
}

export const emptyState = () => ({
  xp: 0,
  startDate: null,
  cards: {},
  unitsDone: [],
  basesDone: [],
  sweepsDone: [],
  streakDays: 0,
  streakFreezes: 0,
  lastDay: null,
  bestSpeed: 0,
  seenIntro: [],
  today: null,
});

export function loadState() {
  return new Promise(async (resolve) => {
    try {
      const r = await window.storage.get("fidel:v1");
      resolve(r && r.value ? { ...emptyState(), ...JSON.parse(r.value) } : emptyState());
    } catch (e) {
      resolve(emptyState());
    }
  });
}

let saveTimer = null;
let pendingSave = null;

// Set by AmharicFidel on mount so a save failure (quota exceeded, storage
// unavailable) actually reaches the user instead of vanishing -- flushSave
// runs from a plain timer and from pagehide/visibilitychange handlers, not
// from a component, so it has no state setter of its own to call. Call
// setSaveFailureNotifier(fn) to wire one up, and again with the no-op
// default on unmount.
let notifySaveFailure = () => {};
export function setSaveFailureNotifier(fn) {
  notifySaveFailure = fn;
}

export function flushSave() {
  if (!pendingSave) return;
  const p = pendingSave;
  pendingSave = null;
  clearTimeout(saveTimer);
  saveTimer = null;
  window.storage.set("fidel:v1", JSON.stringify(p)).catch(() => notifySaveFailure());
}

// `now` is passed for anything you'd be upset to lose: a finished lesson,
// a setting, a new best. Everything else can wait a beat.
export function saveState(s, now) {
  pendingSave = s;
  if (now) return flushSave();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 250);
}

export function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
