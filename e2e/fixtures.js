import { test as base, expect } from "@playwright/test";

// Every test gets a `page` that fails automatically if the app throws an
// uncaught error or logs a console.error while it runs -- this is the main
// value of an E2E suite for a codebase with almost no unit-testable UI logic
// (see src/*.test.js instead for the pure-function coverage): most real
// regressions here have been silent runtime errors (a missing import, a
// prop renamed in one file but not its call site), not wrong output.
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      // "Failed to load resource" is Chrome's own generic network-failure
      // log for any sub-resource (a blocked/slow CDN, a flaky connection),
      // not a signal about app code -- the CSS's Google Fonts @import is a
      // real example that can 404/reset in a locked-down sandbox network
      // while working fine in normal CI. Everything else still fails the
      // test, including a real JS error merely logged via console.error.
      if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) {
        errors.push(`console.error: ${msg.text()}`);
      }
    });
    await use(page);
    expect(errors, `Unexpected console/page errors:\n${errors.join("\n")}`).toEqual([]);
  },
});

export { expect };

// Dismisses the first-launch Spotlight tour if it's showing -- every test
// that isn't specifically about the tour itself wants a clean Home screen.
export async function skipTour(page) {
  const skip = page.locator('button:has-text("Skip")');
  if (await skip.count()) await skip.click();
}
