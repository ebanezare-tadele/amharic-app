// Daily-quest and streak-freeze logic, kept pure and separate from
// App.jsx (no React, no clock, no storage) so it's unit-testable. The
// caller stamps "today" as a string (see todayStamp() in App.jsx) and
// passes it in everywhere here — nothing in this file reads the clock
// itself.

// Small stable string hash, not cryptographic -- just needs to turn a
// day stamp into a deterministic index so everyone sees the same 3
// quests on the same calendar day with no backend involved, and so
// quest rotation lines up with the exact same local-day boundary the
// streak counter already uses (todayStamp() in App.jsx), not a
// separate UTC-based one that could drift a few hours apart from it.
function hashStamp(stamp) {
  let h = 0;
  for (let i = 0; i < stamp.length; i++) h = (h * 31 + stamp.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export const QUEST_POOL = [
  { id: "xp", label: "Earn 20 XP", target: 20, get: (t) => t.xp, reward: 15 },
  { id: "lessons", label: "Complete 1 lesson", target: 1, get: (t) => t.lessonsDone, reward: 15 },
  { id: "correct", label: "Get 10 answers right", target: 10, get: (t) => t.correct, reward: 15 },
  { id: "speed", label: "Play the speed round once", target: 1, get: (t) => t.speedPlayed, reward: 10 },
];

// Same 3 (of the pool's 4) every day for everyone, picked deterministically
// from the date -- no randomness, no server round-trip, and it changes on
// its own at midnight along with the day stamp.
export function questsForDay(dayStamp, count = 3) {
  const start = hashStamp(dayStamp) % QUEST_POOL.length;
  const picked = [];
  for (let i = 0; picked.length < count && i < QUEST_POOL.length; i++) {
    picked.push(QUEST_POOL[(start + i) % QUEST_POOL.length]);
  }
  return picked;
}

export function emptyToday(dayStamp) {
  return { day: dayStamp, xp: 0, lessonsDone: 0, correct: 0, speedPlayed: 0, claimed: [] };
}

// Merges a partial update (e.g. { xp: 15 } to ADD 15 xp today) into
// `today`, rolling over to a fresh one first if the day has changed.
// Returns { today, bonusXp } -- bonusXp is the reward from any quest
// that just crossed its target for the first time today, for the
// caller to add to state.xp wherever this runs inside setState.
export function applyTodayPatch(today, dayStamp, patch) {
  const base = today && today.day === dayStamp ? today : emptyToday(dayStamp);
  const merged = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "claimed") continue; // never caller-settable directly
    merged[k] = (merged[k] || 0) + v;
  }

  const quests = questsForDay(dayStamp);
  let bonusXp = 0;
  const claimed = [...base.claimed];
  for (const q of quests) {
    if (claimed.includes(q.id)) continue;
    if (q.get(merged) >= q.target) {
      claimed.push(q.id);
      bonusXp += q.reward;
    }
  }
  return { today: { ...merged, claimed }, bonusXp };
}

// Streak-freeze: a missed day would normally reset the streak to 1.
// One freeze is granted every 7-day streak milestone (capped so it
// can't be stockpiled indefinitely), and silently spent on a missed
// day to keep the streak alive instead of resetting it. Called from
// the same day-rollover check that already updates streakDays.
export const MAX_FREEZES = 2;

export function rollStreak({ streakDays, streakFreezes, lastDay, yesterdayStamp, todayDay }) {
  if (lastDay === todayDay) {
    return { streakDays, streakFreezes, freezeUsed: false };
  }
  if (lastDay === yesterdayStamp) {
    const days = (streakDays || 0) + 1;
    const freezes = days % 7 === 0 ? Math.min(MAX_FREEZES, (streakFreezes || 0) + 1) : streakFreezes || 0;
    return { streakDays: days, streakFreezes: freezes, freezeUsed: false };
  }
  // A day (or more) was missed.
  if ((streakFreezes || 0) > 0) {
    return { streakDays: streakDays || 1, streakFreezes: streakFreezes - 1, freezeUsed: true };
  }
  return { streakDays: 1, streakFreezes: streakFreezes || 0, freezeUsed: false };
}
