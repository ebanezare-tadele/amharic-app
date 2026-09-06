import { test, expect, skipTour } from "./fixtures.js";

// [glyph, value-as-string, reading] for GEEZ_NUM's first batch (indices 0-8,
// values 1-9) -- mirrors src/content.js's GEEZ_NUM so this test can compute
// the right answer for every question kind Numerals.jsx generates, instead
// of guessing and relying on the requeue-on-miss behavior (which would make
// the loop length non-deterministic).
const ONES = [
  ["፩", "1", "and"], ["፪", "2", "hulet"], ["፫", "3", "sost"], ["፬", "4", "arat"], ["፭", "5", "amist"],
  ["፮", "6", "sidist"], ["፯", "7", "sebat"], ["፰", "8", "simint"], ["፱", "9", "zeteñ"],
];

async function clickOptionExact(page, text) {
  const opts = page.locator(".opt");
  const n = await opts.count();
  for (let i = 0; i < n; i++) {
    if ((await opts.nth(i).innerText()) === text) {
      await opts.nth(i).click();
      return;
    }
  }
  throw new Error(`option not found: ${text}`);
}

async function answerOneQuestion(page) {
  const ask = await page.locator(".ask").innerText();
  let correct;
  if (ask === "Which reading is this?") {
    const g = await page.locator(".glyph").innerText();
    correct = ONES.find((e) => e[0] === g)[2];
  } else if (ask === "Which number is this?") {
    const g = await page.locator(".glyph").innerText();
    correct = ONES.find((e) => e[0] === g)[1];
  } else if (ask === "Which glyph says this?") {
    const r = await page.locator(".prompt-rom").innerText();
    correct = ONES.find((e) => e[2] === r)[0];
  } else {
    const v = await page.locator(".prompt-rom").innerText();
    correct = ONES.find((e) => e[1] === v)[0];
  }
  await clickOptionExact(page, correct);
  await page.locator("button", { hasText: "Continue" }).click();
}

test("Stage three: completing the first numeral batch unlocks the second and shows done", async ({ page }) => {
  await page.goto("./");
  await skipTour(page);

  const stage3Header = page.locator("button", { hasText: "Stage three" });
  await expect(stage3Header).toContainText("▸");
  await stage3Header.click();
  await expect(stage3Header).toContainText("▾");

  const onesCard = page.locator("button.card", { hasText: "The ones" });
  await expect(onesCard).toBeVisible();
  await expect(page.locator("button.card", { hasText: "Tens, and the hundred" })).toHaveAttribute("disabled", "");

  await onesCard.click();

  // NumeralOverview: the intro list of glyph/value/reading rows.
  await expect(page.locator("text=Stage three · numerals")).toBeVisible();
  await expect(page.locator("text=The ones — one through nine.")).toBeVisible();
  await page.locator("button", { hasText: "Start drilling" }).click();

  // 9 numerals x 2 questions each = 18, answered correctly every time so the
  // queue never grows from a requeued miss.
  for (let i = 0; i < 18; i++) {
    await answerOneQuestion(page);
  }

  await expect(page.locator(".disp", { hasText: "Ones learned" })).toBeVisible();
  await expect(page.locator(".stat", { hasText: "100%" })).toBeVisible();
  await page.locator("button", { hasText: "Done" }).click();

  // Back on Home: Home remounts fresh, so Stage three collapses again --
  // reopen it before checking the first batch is done and the second unlocked.
  await expect(page.locator(".card-title", { hasText: "Weeks" })).toBeVisible();
  await page.locator("button", { hasText: "Stage three" }).click();
  await expect(page.locator("button.card.done", { hasText: "The ones" })).toBeVisible();
  await expect(page.locator("button.card", { hasText: "Tens, and the hundred" })).not.toHaveAttribute("disabled", "");
});
