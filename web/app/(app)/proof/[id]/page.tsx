import type {Metadata} from "next";
import {PageShell} from "@/components/layout/PageShell";
import {ProofCard} from "@/components/proof/ProofCard";
import {getAdapter} from "@/lib/locks/adapter";
import {appUrl} from "@/lib/env";
import {formatPercent, lockedShare} from "@/lib/format";
import {activeChain} from "@/lib/chain";
import {WithdrawPanel} from "@/components/locks/WithdrawPanel";
import {ShareCard} from "@/components/share/ShareCard";
import {ChainRecord} from "@/components/chain/ChainRecord";
import {deploymentFor} from "@/lib/contracts/addresses";
import {LocalProofFallback} from "./LocalProofFallback";

/** State depends on the current time, so this cannot be baked at build time. */
export const dynamic = "force-dynamic";

export async function generateMetadata({params}: {params: Promise<{id: string}>}): Promise<Metadata> {
  const {id} = await params;
  const lock = await getAdapter().getLock(id);

  if (!lock) return {title: "Lock proof"};

  const share = formatPercent(lockedShare(lock.amount, lock.token.totalSupply), 1);
  const title = `${share} of $${lock.token.symbol} supply is locked`;
  const description = lock.simulated
    ? `A simulated SealDrop proof. No contract is deployed yet.`
    : `Locked on Robinhood Chain until ${new Date(lock.unlockAt * 1000).toISOString().slice(0, 10)}.`;

  // Absolute, because an OG image URL cannot be relative. The route itself lands in phase 7.
  const image = `${appUrl}/api/og/proof/${id}`;

  return {
    title,
    description,
    openGraph: {title, description, images: [{url: image, width: 1200, height: 630}]},
    twitter: {card: "summary_large_image", title, description, images: [image]},
  };
}

export default async function ProofPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const lock = await getAdapter().getLock(id);

  return (
    <PageShell
      title="Lock proof"
      tag="Rec. 01"
      rail={[
        {label: "Chain", value: activeChain.name},
        {label: "Source", value: lock?.simulated ?? true ? "Simulated" : "Chain state"},
        {label: "Record", value: id, show: "hidden lg:flex"},
      ]}
      lede="A public record of one lock. Every figure below can be checked against the chain."
    >
      <div className="flex max-w-2xl flex-col gap-6">
        {/* An id the server cannot resolve is handed to the client, which checks this
            browser's own locks before concluding it does not exist. */}
        {lock ? <ProofCard lock={lock} /> : <LocalProofFallback id={id} />}

        {/* Owner-only, and it renders nothing for anyone else. The proof above is public; the
            one action it leads to is not. */}
        {lock ? <WithdrawPanel lock={lock} /> : null}

        {lock && !lock.simulated ? (
          <ChainRecord
            kind="lock"
            id={lock.id}
            token={{decimals: lock.token.decimals, symbol: lock.token.symbol}}
          />
        ) : null}

        {lock ? (
          <ShareCard
            kind="lock"
            id={lock.id}
            url={`${appUrl}/proof/${lock.id}`}
            text={
              lock.simulated
                ? `Simulated: ${formatPercent(lockedShare(lock.amount, lock.token.totalSupply), 1)} of $${lock.token.symbol} supply locked with SealDrop.`
                : `${formatPercent(lockedShare(lock.amount, lock.token.totalSupply), 1)} of $${lock.token.symbol} supply is locked.`
            }
            txHash={lock.txHash}
            contract={deploymentFor(lock.chainId)?.PonsLock}
          />
        ) : null}
      </div>
    </PageShell>
  );
}
