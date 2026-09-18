#!/usr/bin/env node
/**
 * The share image and the live canvas beside each other, for the same lock.
 *
 * The hero's whole premise is that they draw the same picture. They share one layout
 * function, and strip-geometry.test.ts proves the block is invariant under particle count,
 * but neither of those checks what it actually looks like. This does.
 */
import {chromium} from "playwright";
import {writeFileSync} from "node:fs";

const id = process.argv[2] ?? "pl_2enswfph";
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1400, height: 900}, deviceScaleFactor: 2});
const page = await context.newPage();

await page.goto(`http://localhost:3000/proof/${id}`, {waitUntil: "networkidle"});
await page.waitForSelector(".strip-field");
await page.waitForTimeout(2400);
await page.locator(".strip-field").first().screenshot({path: ".shots/compare-canvas.png"});

const image = await page.request.get(`http://localhost:3000/api/og/proof/${id}`);
writeFileSync(".shots/compare-og.png", Buffer.from(await image.body()));

console.log("captured both");
await browser.close();
