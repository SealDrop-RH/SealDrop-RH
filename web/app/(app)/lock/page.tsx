import {PageShell} from "@/components/layout/PageShell";
import {LockForm} from "@/components/lock/LockForm";
import {isSimulated} from "@/lib/locks/adapter";
import {activeChain} from "@/lib/chain";

export const metadata = {title: "Lock supply"};

export default function LockPage() {
  return (
    <PageShell
      title="Lock supply"
      tag="Act. 01"
      rail={[
        {label: "Chain", value: activeChain.name},
        {label: "Source", value: isSimulated() ? "Simulated" : "Chain state"},
      ]}
      lede="Pick a token, choose how much and until when, then sign. What comes back is a link anyone can check."
    >
      <LockForm />
    </PageShell>
  );
}
