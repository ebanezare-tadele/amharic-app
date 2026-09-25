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
