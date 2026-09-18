#!/usr/bin/env node
/**
 * Drives the whole product against real contracts.
 *
 * The wallet is a thin EIP-1193 stub that forwards every call to the node. Against anvil
 * that is enough to sign, because anvil holds the keys for its own accounts, so this is a
 * genuine end-to-end write: the app builds the transaction, the node executes real contract
 * bytecode, and the assertions read the result back off chain.
 */
import {chromium} from "playwright";

const RPC = process.env.RPC ?? "http://127.0.0.1:8545";
const ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TOKEN = "0xe906C1628Bbd0dEfE7ccb76431013600218A38f6";
const LOCK = "0x0B2B9B3D465c28F198729661A1B09F113D2CDd26";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({name, ok, detail});
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params}),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1440, height: 1000}});

await context.addInitScript(
  ([account, rpcUrl]) => {
    let id = 0;
    const provider = {
      isMetaMask: true,
      async request({method, params = []}) {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
        // Everything else, including eth_sendTransaction, goes straight to the node. Anvil
        // signs for its own unlocked accounts, so no key ever enters the browser.
        const res = await fetch(rpcUrl, {
          method: "POST",
          headers: {"content-type": "application/json"},
          body: JSON.stringify({jsonrpc: "2.0", id: ++id, method, params}),
        });
        const json = await res.json();
        if (json.error) {
          const err = new Error(json.error.message);
          err.code = json.error.code;
          err.data = json.error.data;
          throw err;
        }
        return json.result;
      },
      on() {}, removeListener() {},
    };
    window.ethereum = provider;
    const info = {uuid: "e2e", name: "E2E Wallet", rdns: "dev.e2e.wallet", icon: "data:image/svg+xml;base64,PHN2Zy8+"};
    const announce = () =>
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {detail: Object.freeze({info, provider})}));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  },
  [ACCOUNT, RPC],
);

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 160)));

/* ---- reads ---- */

await page.goto("http://localhost:3000/explore", {waitUntil: "networkidle"});
await page.waitForTimeout(3500);
const exploreText = await page.locator("main").innerText();
check("explore lists real on-chain locks", exploreText.includes("PTEST"), exploreText.match(/\d+ locks/)?.[0] ?? "");

await page.goto("http://localhost:3000/proof/pl_0", {waitUntil: "networkidle"});
await page.waitForTimeout(2500);
const proofText = await page.locator("main").innerText();
check("proof page reads chain state", proofText.includes("PTEST") && proofText.includes("Amount locked"));
check("simulated ribbon is gone for real locks", !proofText.includes("Simulated"));
check("no dead /tx/0x link", (await page.content()).includes("/tx/0x") === false);

await page.goto("http://localhost:3000/dashboard", {waitUntil: "networkidle"});
await page.waitForTimeout(3000);
check("dashboard renders", (await page.locator("main").innerText()).includes("What would you like to do"));

await page.goto("http://localhost:3000/airdrops", {waitUntil: "networkidle"});
await page.waitForTimeout(3000);
const airText = await page.locator("main").innerText();
check("airdrops still work while locks are on chain", !airText.includes("Loading airdrops") && !airText.includes("could not be loaded"),
  airText.includes("Claimable") || airText.includes("Scheduled") ? "fixtures showing" : "");

/* ---- the write ---- */

// cast sig "lockCount()". Not guessed: a wrong selector returns 0x with no error, and the
// assertion then compares two zeroes and looks like a product failure.
const LOCK_COUNT = "0x9b10b6f5";
const countBefore = BigInt(await rpc("eth_call", [{to: LOCK, data: LOCK_COUNT}, "latest"]));

await page.goto("http://localhost:3000/lock", {waitUntil: "networkidle"});
await page.waitForTimeout(3000);
// RainbowKit renders a truncated displayName ("0xf3…2266"), not the raw address.
await page.getByRole("banner").getByText(/0x[0-9a-fA-F]{2}/).waitFor({timeout: 30000});
check("wallet connects", true, (await page.getByRole("banner").innerText()).split("\n").pop());

await page.locator("#token").fill(TOKEN);
await page.locator("#token-hint").filter({hasText: "PTEST"}).waitFor({timeout: 40000});
check("token resolves from chain", true, "PTEST");

await page.getByRole("button", {name: "25%"}).click();
await page.getByRole("button", {name: "1 month"}).click();
await page.waitForTimeout(800);

const summary = await page.getByRole("complementary", {name: "Lock summary"}).innerText();
check("summary shows share of supply", /%/.test(summary), summary.split("\n").find((l) => /%$/.test(l)) ?? "");

await page.getByRole("button", {name: /^Lock supply$/}).click();
let landed = false;
try {
  await page.waitForURL(/\/lock\/success/, {timeout: 90000});
  landed = true;
} catch {}
check("lock transaction goes through the UI", landed, landed ? new URL(page.url()).search : "did not reach success");

const countAfter = BigInt(await rpc("eth_call", [{to: LOCK, data: LOCK_COUNT}, "latest"]));
check("a new lock exists on chain", countAfter === countBefore + 1n, `lockCount ${countBefore} -> ${countAfter}`);

if (landed) {
  await page.waitForTimeout(3500);
  const successText = await page.locator("main").innerText();
  check("success page shows the real lock", successText.includes("PTEST") && successText.includes("locked"));
  // Read as a value, not as text: the share URL sits in an <input> so it can be selected
  // and copied, and innerText does not see input values.
  const shareUrl = await page.locator("#proof-url").inputValue().catch(() => "");
  check("share link points at the new lock", /\/proof\/pl_\d+$/.test(shareUrl), shareUrl);
}

check("no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
