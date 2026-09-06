import { test, expect, skipTour } from "./fixtures.js";

test("starting the first lesson shows BaseIntro, advances, and drilling produces a verdict", async ({ page }) => {
  await page.goto("./");
  await skipTour(page);

  await page.locator("button.card", { hasText: "The six you" }).first().click();

  // BaseIntro: first letter of the first base batch (ለ).
  await expect(page.locator(".gz", { hasText: "ለ" }).first()).toBeVisible();
  await expect(page.locator("text=Base letter 1 of 6")).toBeVisible();

  // Advance through all six base-letter intro screens into drilling.
  for (let i = 0; i < 6; i++) {
    await page.locator("button", { hasText: /Next letter|Start drilling/ }).first().click();
  }

  // Now in the question engine: four answer options, tapping one shows a verdict.
  const options = page.locator(".opt");
  await expect(options.first()).toBeVisible();
  await options.first().click();

  await expect(page.locator(".vtitle")).toBeVisible();
  await page.locator("button", { hasText: "Continue" }).click();

  // Exiting mid-lesson returns to Home without error.
  await page.locator('button:has-text("✕")').first().click();
  await expect(page.locator(".card-title", { hasText: "Weeks" })).toBeVisible();
});
