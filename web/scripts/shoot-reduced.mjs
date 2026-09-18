import {chromium} from "playwright";
const id = process.argv[2] ?? "pl_2enswfph";
const browser = await chromium.launch();
// Emulated at the browser level, which is what a real viewer's OS setting produces.
const context = await browser.newContext({
  viewport: {width: 1000, height: 700},
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
const page = await context.newPage();
await page.goto(`http://localhost:3000/proof/${id}`, {waitUntil: "networkidle"});
await page.waitForSelector(".strip-field");
await page.waitForTimeout(1200);
await page.locator(".strip-field").first().screenshot({path: ".shots/reduced-motion.png"});
console.log("reduced-motion.png");
await browser.close();
