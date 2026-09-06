import { test, expect, skipTour } from "./fixtures.js";

test("home screen loads and the tab bar covers all five tabs with no errors", async ({ page }) => {
  await page.goto("./");
  await skipTour(page);

  await expect(page.locator(".card-title", { hasText: "Weeks" })).toBeVisible();

  for (const label of ["chart", "more", "read", "write", "learn"]) {
    await page.locator(".tab", { hasText: label }).first().click();
  }
});

test("Stage two starts collapsed; toggling it open reveals its lessons", async ({ page }) => {
  await page.goto("./");
  await skipTour(page);

  const stage2Header = page.locator("button", { hasText: "Stage two" });
  await expect(stage2Header).toContainText("▸");

  // Collapsed: none of stage two's lesson cards are in the DOM yet.
  await expect(page.locator("button.card", { hasText: "The u column" })).toHaveCount(0);

  await stage2Header.click();
  await expect(stage2Header).toContainText("▾");
  await expect(page.locator("button.card", { hasText: "The u column" }).first()).toBeVisible();
});

test("the ? button reopens the Spotlight tour", async ({ page }) => {
  await page.goto("./");
  await skipTour(page);

  await page.locator('button[title="Show the tour again"]').click();
  await expect(page.locator("text=Welcome to ፊደል")).toBeVisible();
  await page.locator('button:has-text("Skip")').click();
  await expect(page.locator("text=Welcome to ፊደል")).toHaveCount(0);
});

test("the persistent Save button opens install help from any tab, and it stays reachable after closing", async ({ page }) => {
  await page.goto("./");
  await skipTour(page);

  const saveBtn = page.locator('button[title="How to save this app to your home screen"]');
  await expect(saveBtn).toBeVisible();

  await saveBtn.click();
  await expect(page.locator("text=Save ፊደል to your home screen")).toBeVisible();
  await page.locator('.card:has-text("Save ፊደል to your home screen") button:has-text("✕")').click();
  await expect(page.locator("text=Save ፊደል to your home screen")).toHaveCount(0);

  // Still reachable from a different tab, not just Home.
  await page.locator(".tab", { hasText: "chart" }).first().click();
  await saveBtn.click();
  await expect(page.locator("text=Save ፊደል to your home screen")).toBeVisible();
});
