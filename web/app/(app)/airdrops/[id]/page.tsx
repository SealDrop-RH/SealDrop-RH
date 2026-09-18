import type {Metadata} from "next";
import {getAirdropsAdapter} from "@/lib/airdrops/adapter";
import {appUrl} from "@/lib/env";
import {formatCompact, formatDate} from "@/lib/format";
import {formatRate, shortInterval} from "@/lib/airdrops/schedule";
import {AirdropDetail} from "./AirdropDetail";

export const dynamic = "force-dynamic";

/**
 * The link card for an airdrop.
 *
 * Points at the still PNG rather than the animated card next to it, for the reason set out
 * in the GIF route: every link-card renderer that matters shows one frame of a GIF, so the
 * animation would buy nothing and cost the still card's sharper text. The GIF is offered as
 * a download on the page instead, which is where it actually plays.
 */
export async function generateMetadata({params}: {params: Promise<{id: string}>}): Promise<Metadata> {
  const {id} = await params;
  const airdrop = await getAirdropsAdapter().getAirdrop(id);

  if (!airdrop) return {title: "Airdrop"};

  const {token, schedule} = airdrop;
  const amount = `${formatCompact(airdrop.reserve, token.decimals)} $${token.symbol}`;
  const title = `${amount} going out to holders`;
  const description = airdrop.simulated
    ? "A simulated SealDrop airdrop. No contract is deployed yet."
    : schedule
      ? `${formatRate(schedule.rateBps)} of what is left every ${shortInterval(schedule.intervalSeconds)}, split by how much each wallet holds.`
      : `One pool, claimable from ${formatDate(airdrop.startsAt)}, split by how much each wallet holds.`;

  // Absolute, because an OG image URL cannot be relative.
  const image = `${appUrl}/api/og/airdrop/${id}`;

  return {
    title,
    description,
    openGraph: {title, description, images: [{url: image, width: 1200, height: 630}]},
    twitter: {card: "summary_large_image", title, description, images: [image]},
  };
}

export default async function AirdropPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  return <AirdropDetail id={id} />;
}
