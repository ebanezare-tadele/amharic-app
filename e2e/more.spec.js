import { test, expect } from "./fixtures.js";

test("More tab opens short (collapsed sections) and expands on tap", async ({ page }) => {
  await page.goto("./");
  await page.locator('button:has-text("Skip")').click().catch(() => {});
  await page.locator(".tab", { hasText: "more" }).first().click();

  await expect(page.locator("text=Ge'ez numerals")).toBeVisible();

  const anchorsHeader = page.locator("button", { hasText: "Anchor words" });
  await expect(anchorsHeader).toContainText("▸");
  await expect(page.locator("text=record it")).toHaveCount(0);

  await anchorsHeader.click();
  await expect(anchorsHeader).toContainText("▾");
  await expect(page.locator("text=record it").first()).toBeVisible();
});
