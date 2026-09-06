import { test, expect } from "./fixtures.js";

test("Read tab: switching category and tapping a letter shows its detail", async ({ page }) => {
  await page.goto("./");
  await page.locator('button:has-text("Skip")').click().catch(() => {});
  await page.locator(".tab", { hasText: "read" }).first().click();

  await expect(page.locator("text=Read sentences")).toBeVisible();

  await page.locator("button", { hasText: "Street & menu" }).click();

  const letters = page.locator(".gz");
  await expect(letters.first()).toBeVisible();
  await letters.first().click();

  // Tapping a letter shows its romanization/mark info in the bottom panel.
  await expect(page.locator("text=mark")).toBeVisible();
});
