#!/usr/bin/env node
/**
 * Screenshots a landing-page variant for side-by-side judging.
 *
 * Differs from shoot.mjs in two ways that matter when the output is meant to be *looked at*
 * rather than diffed:
 *
 * 1. It scrolls the whole page before shooting. Reveal uses `whileInView` with `once: true`,
 *    so a fullPage screenshot of an un-scrolled page captures every below-the-fold section
 *    at opacity 0 — which is why .shots/home-desktop.png is mostly black. Scrolling to the
 *    bottom and back fires every observer first.
 *
 * 2. It shoots the fold separately at 1440x900. A 2880x10000 fullPage PNG is unreadable once
 *    anything scales it to fit, and the fold is the frame that actually decides a landing
 *    page anyway.
 *
 * Usage: node scripts/shoot-variant.mjs <route> [slug] [port]
 */
import {chromium} from "playwright";
import {mkdirSync} from "node:fs";

const route = process.argv[2] ?? "/";
const slug = process.argv[3] ?? (route.replace(/\//g, "_").replace(/^_/, "") || "home");
const port = process.argv[4] ?? "3000";
const base = `http://localhost:${port}`;
const outDir = new URL("../.shots/", import.meta.url).pathname;
mkdirSync(outDir, {recursive: true});

const SHOTS = [
  // The fold. deviceScaleFactor 2 because this is the one that gets looked at closely.
  {name: "hero", width: 1440, height: 900, full: false, scale: 2},
  // The whole page. scale 1 keeps a 10k-tall page under control.
  {name: "full", width: 1440, height: 900, full: true, scale: 1},
  {name: "phone", width: 390, height: 844, full: false, scale: 2},
];

/** Walk the page so every whileInView observer fires, then return to the top. */
async function primeReveals(page) {
  await page.evaluate(async () => {
    const step = Math.floor(window.innerHeight * 0.75);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 300));
    window.scrollTo(0, 0);
  });
  // Long enough for the reveal transitions kicked off by that walk to land.
  await page.waitForTimeout(700);
}

const browser = await chromium.launch();

for (const shot of SHOTS) {
  const context = await browser.newContext({
    viewport: {width: shot.width, height: shot.height},
    deviceScaleFactor: shot.scale,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await page.goto(`${base}${route}`, {waitUntil: "networkidle"});
  await page.evaluate(() => document.fonts.ready);
  await primeReveals(page);
  // The freeze animation runs --dur-freeze (1400ms); shooting inside it gets a half-drawn strip.
  await page.waitForTimeout(2000);

  const file = `${outDir}${slug}-${shot.name}.png`;
  await page.screenshot({path: file, fullPage: shot.full});
  console.log(`.shots/${slug}-${shot.name}.png`);
  await context.close();
}

await browser.close();
