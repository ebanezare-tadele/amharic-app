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

test("More tab: tapping a numeral opens its detail panel, closing it removes it", async ({ page }) => {
  await page.goto("./");
  await page.locator('button:has-text("Skip")').click().catch(() => {});
  await page.locator(".tab", { hasText: "more" }).first().click();

  await page.locator("button", { hasText: "haya" }).click();
  await expect(page.locator(".card .gz", { hasText: "፳" })).toBeVisible();
  await expect(page.locator("text=tens digit")).toBeVisible();

  // Tapping a different numeral swaps the panel to that one instead.
  await page.locator("button", { hasText: "meto" }).click();
  await expect(page.locator("text=The hundred.")).toBeVisible();

  await page.locator(".card button:has-text(\"✕\")").click();
  await expect(page.locator("text=The hundred.")).toHaveCount(0);
});
