#!/usr/bin/env node
/**
 * Fails if any route scrolls sideways at 320px, which is the narrowest viewport worth
 * supporting and the one nobody opens by hand.
 */
import {chromium} from "playwright";

const port = process.argv[2] ?? "3000";
const ROUTES = ["/", "/dashboard", "/lock", "/lock/success", "/explore", "/me", "/proof/pl_2enswfph", "/airdrops", "/airdrops/new", "/kitchen-sink"];

const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 320, height: 720}});
const page = await context.newPage();

let failures = 0;
for (const route of ROUTES) {
  await page.goto(`http://localhost:${port}${route}`, {waitUntil: "networkidle"});
  await page.waitForTimeout(500);
  const {scrollWidth, clientWidth, widest} = await page.evaluate(() => {
    const root = document.documentElement;
    let widest = "";
    let max = 0;
    for (const element of document.querySelectorAll("*")) {
      const right = element.getBoundingClientRect().right;
      if (right > max) {
        max = right;
        widest = element.tagName.toLowerCase() + (element.className ? `.${String(element.className).slice(0, 60)}` : "");
      }
    }
    return {scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, widest};
  });

  // One pixel of slack for sub-pixel rounding on fractional layouts.
  const overflows = scrollWidth > clientWidth + 1;
  if (overflows) failures += 1;
  console.log(
    `${overflows ? "OVERFLOW" : "ok      "} ${route.padEnd(22)} ${scrollWidth}/${clientWidth}${overflows ? `  widest: ${widest}` : ""}`,
  );
}

await browser.close();
if (failures > 0) {
  console.error(`\n${failures} route${failures === 1 ? "" : "s"} scroll sideways at 320px.`);
  process.exit(1);
}
console.log("\nno horizontal scroll at 320px.");
