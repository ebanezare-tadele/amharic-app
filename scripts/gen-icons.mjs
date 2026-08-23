// One-off icon generator: renders the app's own "ፊ" mark (rubric-red on
// ink-black, matching the top-bar mark in App.jsx's CSS) at each size the
// PWA manifest / iOS home screen needs, via headless Chromium instead of
// a binary image toolchain. Not part of the build — run manually when the
// icon needs to change:
//
//   node scripts/gen-icons.mjs
//
// Requires Playwright's Chromium. If PLAYWRIGHT_BROWSERS_PATH isn't set
// globally in your environment, point it at wherever `playwright install`
// put chromium for you.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, "icon-template.html");
const outDir = path.join(__dirname, "..", "public", "icons");

const BG = "#10162A"; // --ink
const FG = "#CE452C"; // --rubric

const TARGETS = [
  { file: "icon-192.png", size: 192, pad: 0.18 },
  { file: "icon-512.png", size: 512, pad: 0.18 },
  { file: "maskable-192.png", size: 192, pad: 0.3 },
  { file: "maskable-512.png", size: 512, pad: 0.3 },
  { file: "apple-touch-icon.png", size: 180, pad: 0.16 },
];

async function main() {
  await import("node:fs/promises").then((fs) => fs.mkdir(outDir, { recursive: true }));

  const html = await readFile(templatePath, "utf8");
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();

  for (const t of TARGETS) {
    await page.setViewportSize({ width: t.size, height: t.size });
    const url = `http://localhost:${port}/?size=${t.size}&pad=${t.pad}&bg=${encodeURIComponent(BG)}&fg=${encodeURIComponent(FG)}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.title === "ready", { timeout: 15000 });
    await page.screenshot({ path: path.join(outDir, t.file) });
    console.log("wrote", t.file);
  }

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
