import { test, expect, skipTour } from "./fixtures.js";

// The official clips only play when manifest.json lists them (see the
// manifest fetch in AmharicFidel). ለ's row is in the verified set, so the
// first lesson's intro should offer "hear it" and fetch the real file.
test("hear it on the first letter plays the verified official clip", async ({ page }) => {
  await page.goto("./");
  await skipTour(page);
  await page.locator("button.card", { hasText: "The six you" }).first().click();
  await expect(page.locator("text=Base letter 1 of 6")).toBeVisible();

  const clip = page.waitForResponse((r) => r.url().endsWith("/audio/official/letter-0-0.mp3"));
  await page.locator("button", { hasText: "► hear it" }).first().click();
  const res = await clip;
  expect(res.ok()).toBe(true); // 206 Partial Content is normal for media

  // And it decodes as real audio of a plausible single-syllable length.
  const duration = await page.evaluate(
    (url) =>
      new Promise((resolve, reject) => {
        const a = new Audio(url);
        a.onloadedmetadata = () => resolve(a.duration);
        a.onerror = () => reject(new Error("audio failed to decode"));
      }),
    res.url(),
  );
  expect(duration).toBeGreaterThan(0.05);
  expect(duration).toBeLessThan(2);
});

test("the row's hear it plays all seven verified letters, in order, one at a time", async ({ page }) => {
  await page.goto("./");
  await page.locator('button:has-text("Skip")').click().catch(() => {});
  await page.locator(".tab", { hasText: "chart" }).first().click();
  await page.locator(".cc").first().click(); // ለ

  // Log every media element's play/ended in page order, to prove they
  // run strictly one after another rather than overlapping.
  await page.evaluate(() => {
    window.__events = [];
    const log = (type) => (e) => window.__events.push(`${type}:${(e.target.src || "").split("/").pop()}`);
    document.addEventListener("play", log("play"), true);
    document.addEventListener("ended", log("ended"), true);
    const orig = window.Audio;
    window.Audio = function (...a) {
      const el = new orig(...a);
      el.addEventListener("play", log("play"));
      el.addEventListener("ended", log("ended"));
      return el;
    };
  });

  // The Chant's hear it (the row), not the single-letter one below it.
  await page.locator("button", { hasText: "► chant the row" }).locator("xpath=..").locator("button", { hasText: "► hear it" }).click();

  const expected = [0, 1, 2, 3, 4, 5, 6].flatMap((o) => [`play:letter-0-${o}.mp3`, `ended:letter-0-${o}.mp3`]);
  await expect
    .poll(() => page.evaluate(() => window.__events.filter((e) => e.includes("letter-"))), { timeout: 20000 })
    .toEqual(expected);
});

test("starting another sound stops the row that's playing", async ({ page }) => {
  await page.goto("./");
  await page.locator('button:has-text("Skip")').click().catch(() => {});
  await page.locator(".tab", { hasText: "chart" }).first().click();
  await page.locator(".cc").first().click();
  await page.evaluate(() => {
    window.__plays = [];
    const orig = window.Audio;
    window.Audio = function (...a) {
      const el = new orig(...a);
      window.__el = el;
      el.addEventListener("play", () => window.__plays.push(el.src.split("/").pop()));
      return el;
    };
  });

  const row = page.locator("button", { hasText: "► chant the row" }).locator("xpath=..").locator("button", { hasText: "► hear it" });
  await row.click();
  await expect.poll(() => page.evaluate(() => window.__plays.filter((n) => n.startsWith("letter-")).length)).toBeGreaterThan(0);

  // The visual-only chant takes over: the row's audio must stop for good.
  await page.locator("button", { hasText: "► chant the row" }).click();
  const atStop = await page.evaluate(() => window.__plays.length);
  expect(await page.evaluate(() => window.__el.paused)).toBe(true);
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => window.__plays.length)).toBe(atStop);
});
