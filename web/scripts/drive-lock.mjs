#!/usr/bin/env node
/**
 * Drives the lock flow end to end in a real browser, including each failure mode.
 *
 * The wallet is stubbed at the EIP-1193 level rather than mocked inside the app, so the
 * app's own connect path, address handling and network guard all run for real.
 */
import {chromium} from "playwright";
import {mkdirSync} from "node:fs";

const port = process.argv[2] ?? "3000";
const base = `http://localhost:${port}`;
const outDir = new URL("../.shots/", import.meta.url).pathname;
mkdirSync(outDir, {recursive: true});

const ADDRESS = "0x88e57A9F8f021Aa24bfC757675D06edFa7f0bFB0";
const TOKEN = "0x4A1F9c2E7b58d0AE36c1b77De5490FBA2C81D306"; // $SPAN

const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1100, height: 1000}, deviceScaleFactor: 2});

// A minimal injected provider. RainbowKit finds it through EIP-6963, which is the same path
// a real extension takes, so nothing about the app is special-cased for the test.
await context.addInitScript(
  ([address]) => {
    const provider = {
      isMetaMask: true,
      request: async ({method}) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
        if (method === "eth_chainId") return "0x1237"; // 4663
        if (method === "net_version") return "4663";
        return null;
      },
      on: () => {},
      removeListener: () => {},
    };
    window.ethereum = provider;
    const info = {uuid: "test-wallet", name: "Test Wallet", rdns: "dev.test.wallet", icon: "data:image/svg+xml,<svg/>"};
    const announce = () =>
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {detail: Object.freeze({info, provider})}));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  },
  [ADDRESS],
);

const page = await context.newPage();
const problems = [];
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 200)}`);
});

async function connect() {
  await page.goto(`${base}/lock`, {waitUntil: "networkidle"});
  // The stub reports the account as already authorised, which is what a returning visitor's
  // extension does, so wagmi reconnects on its own through EIP-6963. Waiting for the address
  // in the header is the honest signal that it worked.
  await page.waitForSelector("text=/0x88.*bFB0/", {timeout: 20000});
}

async function fillForm() {
  await page.locator("#token").fill(TOKEN);
  await page.waitForSelector("text=/SPAN/", {timeout: 8000});
  await page.getByRole("button", {name: "50%"}).click();
  await page.getByRole("button", {name: "1 year"}).click();
  await page.waitForTimeout(250);
}

async function setFault(fault) {
  await page.evaluate((f) => {
    sessionStorage.setItem("pons-lock-fault", f);
    window.dispatchEvent(new CustomEvent("pons-lock:fault-change"));
  }, fault);
}

await connect();
await fillForm();
await page.screenshot({path: `${outDir}lock-form-filled.png`, fullPage: true});
console.log("form filled and reviewed");

// Every failure path, each one reachable with one setting.
for (const fault of ["reject", "revert", "insufficient-gas", "wrong-network", "timeout"]) {
  await setFault(fault);
  await page.getByRole("button", {name: /^Lock supply$/}).click();
  await page.waitForSelector("text=That did not go through", {timeout: 20000});
  const message = await page.locator("text=That did not go through").locator("..").innerText();
  console.log(`  ${fault.padEnd(18)} ${message.split("\n")[1]?.slice(0, 74) ?? ""}`);
  await page.getByRole("button", {name: /back to the form/i}).click();
  await page.waitForTimeout(200);
}

await page.screenshot({path: `${outDir}lock-error.png`});

// And the success path.
await setFault("none");
await page.getByRole("button", {name: /^Lock supply$/}).click();
await page.waitForURL(/\/lock\/success/, {timeout: 20000});
console.log("reached", new URL(page.url()).pathname + new URL(page.url()).search);

await page.waitForTimeout(2600);
await page.screenshot({path: `${outDir}lock-success.png`, fullPage: true});

const heading = await page.locator("text=/is locked/").first().innerText();
console.log("success heading:", heading);

// The proof link the success page hands over has to actually open.
const proofUrl = await page.locator("#proof-url").inputValue();
await page.goto(proofUrl, {waitUntil: "networkidle"});
await page.waitForTimeout(600);
const localDraft = await page.locator("text=Local draft").count();
console.log("proof opens:", new URL(page.url()).pathname, localDraft ? "(local draft state)" : "");
await page.screenshot({path: `${outDir}proof-local.png`, fullPage: true});

console.log(problems.length ? `\nPROBLEMS:\n${problems.slice(0, 8).join("\n")}` : "\nno page errors");
await browser.close();
