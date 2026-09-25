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
  expect(res.status()).toBe(200); // fetched whole, so the service worker can cache it

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
  await skipTour(page);
  await page.locator(".tab", { hasText: "chart" }).first().click();
  await page.locator(".cc").first().click(); // ለ

  // Log each clip's fetch, and every play/ended of the (shared) media
  // element, in page order -- proving the clips run strictly one after
  // another rather than overlapping.
  await page.evaluate(() => {
    window.__events = [];
    const origFetch = window.fetch;
    window.fetch = (url, ...rest) => {
      const name = String(url).split("/").pop();
      if (name.startsWith("letter-")) window.__events.push(`fetch:${name}`);
      return origFetch(url, ...rest);
    };
    const orig = window.Audio;
    window.Audio = function (...a) {
      const el = new orig(...a);
      const log = (type) => () => { if (el.src.startsWith("blob:")) window.__events.push(type); };
      el.addEventListener("play", log("play"));
      el.addEventListener("ended", log("ended"));
      return el;
    };
  });

  // The Chant's hear it (the row), not the single-letter one below it.
  await page.locator("button", { hasText: "► chant the row" }).locator("xpath=..").locator("button", { hasText: "► hear it" }).click();

  const expected = [0, 1, 2, 3, 4, 5, 6].flatMap((o) => [`fetch:letter-0-${o}.mp3`, "play", "ended"]);
  await expect.poll(() => page.evaluate(() => window.__events), { timeout: 20000 }).toEqual(expected);
});

test("starting another sound stops the row that's playing", async ({ page }) => {
  await page.goto("./");
  await skipTour(page);
  await page.locator(".tab", { hasText: "chart" }).first().click();
  await page.locator(".cc").first().click();
  await page.evaluate(() => {
    window.__plays = [];
    const orig = window.Audio;
    window.Audio = function (...a) {
      const el = new orig(...a);
      window.__el = el;
      el.addEventListener("play", () => el.src.startsWith("blob:") && window.__plays.push(el.src));
      return el;
    };
  });

  const row = page.locator("button", { hasText: "► chant the row" }).locator("xpath=..").locator("button", { hasText: "► hear it" });
  await row.click();
  await expect.poll(() => page.evaluate(() => window.__plays.length)).toBeGreaterThan(0);

  // The visual-only chant takes over: the row's audio must stop for good.
  await page.locator("button", { hasText: "► chant the row" }).click();
  const atStop = await page.evaluate(() => window.__plays.length);
  expect(await page.evaluate(() => window.__el.paused)).toBe(true);
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => window.__plays.length)).toBe(atStop);
});

test("a clip played once still plays after going offline", async ({ page, context }) => {
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await skipTour(page);
  await page.locator(".tab", { hasText: "chart" }).first().click();
  await page.locator(".cc").first().click();

  const played = () =>
    page.evaluate(() => {
      window.__ok = false;
      const orig = window.Audio;
      window.Audio = function (...a) {
        const el = new orig(...a);
        el.addEventListener("ended", () => { if (el.src.startsWith("blob:")) window.__ok = true; });
        return el;
      };
    });
  await played();
  await page.locator(".card button", { hasText: "► hear it" }).last().click();
  await expect.poll(() => page.evaluate(() => window.__ok), { timeout: 10000 }).toBe(true);
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open("official-audio-v3")).keys()).map((r) => r.url.split("/").pop())))
    .toContain("letter-0-0.mp3");

  await context.setOffline(true);
  await page.reload();
  await skipTour(page);
  await page.locator(".tab", { hasText: "chart" }).first().click();
  await page.locator(".cc").first().click();
  await played();
  await page.locator(".card button", { hasText: "► hear it" }).last().click();
  await expect.poll(() => page.evaluate(() => window.__ok), { timeout: 10000 }).toBe(true);
});
