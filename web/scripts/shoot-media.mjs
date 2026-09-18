#!/usr/bin/env node
/**
 * Re-shoots the four screenshots the top-level README embeds.
 *
 * Usage: pnpm start, then `node scripts/shoot-media.mjs [port]`.
 *
 * These used to be taken by hand, which meant that after any change to the chrome the README
 * quietly went on showing the previous design — the brand rename is exactly the case that
 * turned up. The frames are fixed here instead: one route and one viewport height per image,
 * matching what the README already embeds, so a rerun produces the same crop rather than a
 * new one somebody then has to re-eyeball against the old.
 *
 * Shot at 2x and resampled down to the stated width. A 1400px-wide screenshot taken at 1x has
 * soft text on the hairline type this app sets everywhere; taken at 2x and halved, it does
 * not.
 *
 * Fixtures, not the chain. Every route below is the app in its default simulated mode, which
 * is what the README is documenting and is the only way these can be regenerated without a
 * funded wallet on a live chain.
 */
import {chromium} from "playwright";
import {mkdirSync} from "node:fs";

const port = process.argv[2] ?? "3000";
const base = `http://localhost:${port}`;
const out = new URL("../../.github/media/", import.meta.url).pathname;

const WIDTH = 1400;

/**
 * The proof shot needs a lock that exists, and fixture ids are generated rather than written
 * down -- `pl_ejdfgd7v`, not `pl_1`. They are stable across runs, because fixtures.ts seeds
 * its own generator, but they are not stable across a change to that file. So the id is read
 * off /explore at shoot time instead of pinned here, where it would silently rot into the
 * "No lock with that id" empty state and ship that to the README.
 */
async function firstProofId() {
  const html = await (await fetch(`${base}/explore`)).text();
  const found = html.match(/\/proof\/(pl_[A-Za-z0-9]+)/);
  if (!found) throw new Error("no proof link on /explore -- is the app on fixtures?");
  return found[1];
}

const SHOTS = [
  {file: "dashboard.png", route: "/dashboard", height: 681},
  {file: "airdrops.png", route: "/airdrops", height: 681},
  {file: "lock.png", route: "/lock", height: 729},
  {file: "proof.png", route: `/proof/${await firstProofId()}`, height: 788},
];

mkdirSync(out, {recursive: true});
const browser = await chromium.launch();

for (const {file, route, height} of SHOTS) {
  const context = await browser.newContext({
    viewport: {width: WIDTH, height},
    deviceScaleFactor: 2,
    colorScheme: "dark",
    // The strip and the chart both animate in. A still of a half-drawn hero is worse than no
    // still at all, and reduced motion is the one setting that reliably lands them finished.
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${base}${route}`, {waitUntil: "networkidle"});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  await page.screenshot({path: `${out}${file}`, scale: "css"});
  console.log(`${file}  ${WIDTH}x${height}  ${route}`);
  await context.close();
}

await browser.close();
