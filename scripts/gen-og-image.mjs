// Generates public/og-image.png — the preview card shown when this app's
// URL is shared in iMessage/WhatsApp/Slack/etc. (Open Graph + Twitter
// Card standard size, 1200x630). Same headless-Chromium-canvas approach
// as gen-icons.mjs. Re-run after changing scripts/og-image-template.html:
//
//   node scripts/gen-og-image.mjs

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, "og-image-template.html");
const outPath = path.join(__dirname, "..", "public", "og-image.png");

async function main() {
  const html = await readFile(templatePath, "utf8");
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.title === "ready", { timeout: 15000 });
  await page.screenshot({ path: outPath });
  console.log("wrote", outPath);

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
