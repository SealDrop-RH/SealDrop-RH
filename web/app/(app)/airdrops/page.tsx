import Link from "next/link";
import {PageShell} from "@/components/layout/PageShell";
import {AirdropList} from "@/components/airdrops/AirdropList";
import {buttonClass} from "@/components/ui/primitives";
import {activeChain} from "@/lib/chain";

export const metadata = {title: "Airdrops"};

export default function AirdropsPage() {
  return (
    <PageShell
      title="Airdrops"
      tag="Tbl. 01"
      rail={[{label: "Chain", value: activeChain.name}]}
      lede="Send part of a supply to the people holding it. Every wallet's cut is its share of the holdings that qualify, so nobody has to be picked by hand."
      actions={
        <Link href="/airdrops/new" className={buttonClass("primary", "sm")}>
          Create an airdrop
        </Link>
      }
    >
      <AirdropList />
    </PageShell>
  );
}
