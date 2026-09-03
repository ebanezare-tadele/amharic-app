import { describe, it, expect } from "vitest";
import { questsForDay, emptyToday, applyTodayPatch, rollStreak, MAX_FREEZES, QUEST_POOL } from "./gamification.js";

describe("questsForDay", () => {
  it("is deterministic for the same day stamp", () => {
    expect(questsForDay("2026-8-30")).toEqual(questsForDay("2026-8-30"));
  });

  it("returns the requested count, all valid pool entries, no duplicates", () => {
    const qs = questsForDay("2026-8-30", 3);
    expect(qs).toHaveLength(3);
    expect(new Set(qs.map((q) => q.id)).size).toBe(3);
    qs.forEach((q) => expect(QUEST_POOL).toContain(q));
  });

  it("differs across at least some different day stamps", () => {
    const days = Array.from({ length: 10 }, (_, i) => questsForDay(`2026-8-${i + 1}`).map((q) => q.id).join(","));
    expect(new Set(days).size).toBeGreaterThan(1);
  });
});

describe("applyTodayPatch", () => {
  it("starts fresh for a new day stamp", () => {
    const { today } = applyTodayPatch(null, "2026-8-30", { xp: 5 });
    expect(today).toMatchObject({ day: "2026-8-30", xp: 5, lessonsDone: 0, correct: 0, speedPlayed: 0, claimed: [] });
  });

  it("accumulates patches within the same day", () => {
    let { today } = applyTodayPatch(emptyToday("2026-8-30"), "2026-8-30", { xp: 5 });
    ({ today } = applyTodayPatch(today, "2026-8-30", { xp: 5 }));
    expect(today.xp).toBe(10);
  });

  it("rolls over to a fresh today when the day stamp changes, discarding yesterday's counts", () => {
    const yesterday = { day: "2026-8-29", xp: 999, lessonsDone: 9, correct: 9, speedPlayed: 9, claimed: ["xp"] };
    const { today } = applyTodayPatch(yesterday, "2026-8-30", { xp: 1 });
    expect(today).toMatchObject({ day: "2026-8-30", xp: 1, lessonsDone: 0, claimed: [] });
  });

  it("grants a quest's reward exactly once, the moment it crosses target", () => {
    const day = "2026-8-30";
    const quests = questsForDay(day);
    const xpQuest = quests.find((q) => q.id === "xp");
    if (!xpQuest) return; // xp quest isn't in today's 3 -- nothing to assert
    let today = emptyToday(day);
    let r = applyTodayPatch(today, day, { xp: xpQuest.target - 1 });
    expect(r.bonusXp).toBe(0);
    today = r.today;
    r = applyTodayPatch(today, day, { xp: 1 }); // crosses target now
    expect(r.bonusXp).toBe(xpQuest.reward);
    expect(r.today.claimed).toContain("xp");
    today = r.today;
    r = applyTodayPatch(today, day, { xp: 5 }); // already claimed -- no double payout
    expect(r.bonusXp).toBe(0);
  });

  it("only ever grants rewards for quests actually selected today", () => {
    // "lessons" not necessarily in today's 3 -- if it isn't, completing
    // its condition shouldn't pay out.
    const day = "2026-8-30";
    const quests = questsForDay(day);
    if (quests.some((q) => q.id === "lessons")) return;
    const { bonusXp, today } = applyTodayPatch(emptyToday(day), day, { lessonsDone: 5 });
    expect(bonusXp).toBe(0);
    expect(today.claimed).not.toContain("lessons");
  });
});

describe("rollStreak", () => {
  it("no-ops if already recorded today", () => {
    const r = rollStreak({ streakDays: 4, streakFreezes: 1, lastDay: "2026-8-30", yesterdayStamp: "2026-8-29", todayDay: "2026-8-30" });
    expect(r).toEqual({ streakDays: 4, streakFreezes: 1, freezeUsed: false });
  });

  it("extends the streak by 1 on a consecutive day", () => {
    const r = rollStreak({ streakDays: 4, streakFreezes: 0, lastDay: "2026-8-29", yesterdayStamp: "2026-8-29", todayDay: "2026-8-30" });
    expect(r.streakDays).toBe(5);
    expect(r.freezeUsed).toBe(false);
  });

  it("grants a freeze on a 7-day milestone, capped at MAX_FREEZES", () => {
    const r = rollStreak({ streakDays: 6, streakFreezes: 0, lastDay: "2026-8-29", yesterdayStamp: "2026-8-29", todayDay: "2026-8-30" });
    expect(r.streakDays).toBe(7);
    expect(r.streakFreezes).toBe(1);

    const capped = rollStreak({ streakDays: 13, streakFreezes: MAX_FREEZES, lastDay: "2026-8-29", yesterdayStamp: "2026-8-29", todayDay: "2026-8-30" });
    expect(capped.streakDays).toBe(14);
    expect(capped.streakFreezes).toBe(MAX_FREEZES);
  });

  it("spends a freeze to preserve the streak on a missed day", () => {
    const r = rollStreak({ streakDays: 10, streakFreezes: 1, lastDay: "2026-8-27", yesterdayStamp: "2026-8-29", todayDay: "2026-8-30" });
    expect(r.streakDays).toBe(10);
    expect(r.streakFreezes).toBe(0);
    expect(r.freezeUsed).toBe(true);
  });

  it("resets to 1 on a missed day with no freeze available", () => {
    const r = rollStreak({ streakDays: 10, streakFreezes: 0, lastDay: "2026-8-27", yesterdayStamp: "2026-8-29", todayDay: "2026-8-30" });
    expect(r.streakDays).toBe(1);
    expect(r.freezeUsed).toBe(false);
  });

  it("resets to 1 on a first-ever visit (lastDay null)", () => {
    const r = rollStreak({ streakDays: 0, streakFreezes: 0, lastDay: null, yesterdayStamp: "2026-8-29", todayDay: "2026-8-30" });
    expect(r.streakDays).toBe(1);
  });
});
