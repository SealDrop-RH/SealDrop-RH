import {NextResponse} from "next/server";
import {publishAll} from "@/lib/airdrops/publisher";

/**
 * Republishes every live drip's split, then sends holders what has built up.
 *
 * Scheduled rather than triggered by anyone, because nobody is watching on anyone else's
 * behalf: a transfer between two holders moves what everybody else is owed, and holders no
 * longer claim, so nothing reaches them unless this runs.
 *
 * Every minute, the shortest round a drip can have, so a drip set to pay every minute is paid
 * every minute rather than in bundles. That does not make every drip cost a transaction a minute:
 * the keeper only pays once at least half a round has built up, so an hourly drip is still paid
 * about hourly. A run that is skipped loses nothing; the next payout sends what built up.
 *
 * Runs can overlap, because a run may take longer than the minute between them and Vercel does
 * not hold the next one back. The keeper re-reads the chain immediately before each transaction
 * and stands down if another run has already done the work.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Vercel signs its own cron calls with this header. Without a secret configured the route is
  // open, which is fine locally and is why deploying without one is called out in the response.
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({error: "unauthorised"}, {status: 401});
  }

  try {
    const outcomes = await publishAll();
    return NextResponse.json({
      ran: new Date().toISOString(),
      unprotected: !process.env.CRON_SECRET,
      published: outcomes.filter((o) => o.action === "published").length,
      paid: outcomes.filter((o) => o.payout?.action === "paid").length,
      outcomes,
    });
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : "The publisher failed"},
      {status: 500},
    );
  }
}
