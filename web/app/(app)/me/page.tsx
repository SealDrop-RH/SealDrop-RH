import {PageShell} from "@/components/layout/PageShell";
import {MyLocks} from "@/components/locks/MyLocks";
import {isSimulated} from "@/lib/locks/adapter";
import {activeChain} from "@/lib/chain";

export const metadata = {title: "My locks"};

export default function MyLocksPage() {
  return (
    <PageShell
      title="My locks"
      tag="Tbl. 01"
      rail={[
        {label: "Chain", value: activeChain.name},
        {label: "Source", value: isSimulated() ? "Simulated" : "Chain state"},
        {label: "Scope", value: "Connected wallet", show: "hidden lg:flex"},
      ]}
      lede="Everything the connected wallet has locked, soonest to unlock first."
    >
      <MyLocks />
    </PageShell>
  );
}
