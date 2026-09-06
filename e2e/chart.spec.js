import { test, expect } from "./fixtures.js";

test("Chart tab: tapping a letter opens its detail panel, closing it removes it", async ({ page }) => {
  await page.goto("./");
  await page.locator('button:has-text("Skip")').click().catch(() => {});
  await page.locator(".tab", { hasText: "chart" }).first().click();

  await expect(page.locator("text=THE WHOLE SYSTEM")).toBeVisible();

  await page.locator(".cc").first().click();
  await expect(page.locator("button", { hasText: "► chant the row" })).toBeVisible();
  await expect(page.locator(".eyebrow", { hasText: "Your voice" })).toBeVisible();

  // The detail panel's own close button, not the Callout tip's dismiss ✕
  // that also renders inside the same .card.
  await page.locator('.card button:has-text("✕")').first().click();
  await expect(page.locator("button", { hasText: "► chant the row" })).toHaveCount(0);
});
