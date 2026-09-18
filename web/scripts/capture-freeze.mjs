#!/usr/bin/env node
/**
 * Captures the freeze as a strip of frames, so the choreography can be judged rather than
 * guessed at. Reviewing an animation by watching it at full speed is how timing bugs ship.
 */
import {chromium} from "playwright";
import {mkdirSync} from "node:fs";

const id = process.argv[2] ?? "pl_2enswfph";
const port = process.argv[3] ?? "3000";
const outDir = new URL("../.shots/", import.meta.url).pathname;
mkdirSync(outDir, {recursive: true});

const AT_MS = [0, 120, 300, 500, 700, 900, 1100, 1400, 2200];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: {width: 1000, height: 700},
  deviceScaleFactor: 2,
});
const page = await context.newPage();

// The freeze plays once per lock per tab, so the marker has to be cleared or the page
// simply renders the end state.
await context.addInitScript(() => {
  try {
    sessionStorage.clear();
  } catch {}
});

await page.goto(`http://localhost:${port}/proof/${id}`, {waitUntil: "networkidle"});
await page.evaluate(() => document.fonts.ready);

// Reloading is what restarts the animation; each pass is captured at one offset so the
// frames are real renders rather than a paused timeline.
for (const at of AT_MS) {
  await page.reload({waitUntil: "domcontentloaded"});
  await page.waitForSelector(".strip-field");
  await page.waitForTimeout(at);
  const field = await page.locator(".strip-field").first();
  await field.screenshot({path: `${outDir}freeze-${String(at).padStart(4, "0")}.png`});
  console.log(`freeze-${String(at).padStart(4, "0")}.png`);
}

await browser.close();
