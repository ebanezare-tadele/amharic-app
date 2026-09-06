import { defineConfig, devices } from "@playwright/test";

// Serves the production build (not the dev server) so the suite exercises
// exactly what actually ships -- vite.config.js's base path (/amharic-app/)
// included, since that's a real source of past bugs (GitHub Pages subpath
// deploys, service worker scope).
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/amharic-app/`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // In CI, `npx playwright install --with-deps chromium` (see
    // .github/workflows/e2e.yml) fetches a browser matching whatever
    // @playwright/test version is pinned, so the default launch works as-is.
    // Outside CI this repo may run in a sandbox with a pre-seeded browser at
    // a fixed path instead (no network access to fetch a matching one) --
    // point at that instead of failing with "browser not found".
    launchOptions: process.env.CI
      ? {}
      : { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
