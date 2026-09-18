#!/usr/bin/env node
/**
 * Runs the keeper (republish, then pay out) on a loop, for local development.
 *
 * vercel.json schedules /api/cron/airdrops in production, and nothing schedules anything on
 * localhost: a dev server has no cron. Without this the release accrues while the published
 * split stays where it was, which looks exactly like the drip being broken.
 *
 *   pnpm publish-roots                  every 60s against localhost:3000
 *   INTERVAL=30 URL=... pnpm publish-roots
 */
const url = process.env.URL ?? "http://localhost:3000/api/cron/airdrops";
const interval = Number(process.env.INTERVAL ?? 60) * 1000;
const secret = process.env.CRON_SECRET;

async function run() {
  const at = new Date().toISOString().slice(11, 19);
  try {
    const response = await fetch(url, {
      headers: secret ? {authorization: `Bearer ${secret}`} : {},
    });
    const body = await response.json();
    if (!response.ok) {
      console.log(`${at}  ${response.status}  ${body.error ?? "failed"}`);
      return;
    }
    const lines = (body.outcomes ?? []).map((o) => {
      const split = `    ${o.id}  ${o.action}${o.reason ? `  (${o.reason})` : ""}`;
      const p = o.payout;
      if (!p) return split;
      const sent = p.accounts ? `  ${p.accounts} wallets, ${p.amount} units` : "";
      return `${split}\n        payout ${p.action}${sent}${p.reason ? `  (${p.reason})` : ""}`;
    });
    console.log(`${at}  published ${body.published}, paid ${body.paid ?? 0}\n${lines.join("\n")}`);
  } catch (error) {
    console.log(`${at}  unreachable: ${error.message}`);
  }
}

await run();
setInterval(run, interval);
