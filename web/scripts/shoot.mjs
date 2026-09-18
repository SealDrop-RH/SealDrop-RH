#!/usr/bin/env node
/**
 * Screenshots a route at desktop and phone width.
 *
 * Usage: node scripts/shoot.mjs [route] [port]
 */
import {chromium} from "playwright";
import {mkdirSync} from "node:fs";

const route = process.argv[2] ?? "/";
const port = process.argv[3] ?? "3000";
const base = `http://localhost:${port}`;
const outDir = new URL("../.shots/", import.meta.url).pathname;
mkdirSync(outDir, {recursive: true});

const VIEWPORTS = [
  {name: "desktop", width: 1440, height: 1200, full: true},
  {name: "phone", width: 390, height: 844, full: false},
];

const browser = await chromium.launch();
const slug = route.replace(/\//g, "_").replace(/^_/, "") || "home";

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: {width: viewport.width, height: viewport.height},
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await page.goto(`${base}${route}`, {waitUntil: "networkidle"});
  await page.evaluate(() => document.fonts.ready);
  // Long enough for the freeze to settle, so a screenshot is never a half-drawn hero.
  await page.waitForTimeout(2000);

  const file = `${outDir}${slug}-${viewport.name}.png`;
  await page.screenshot({path: file, fullPage: viewport.full});
  console.log(file.split("/").slice(-1)[0]);
  await context.close();
}

await browser.close();
