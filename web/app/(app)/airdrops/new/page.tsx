import {Suspense} from "react";
import {PageShell} from "@/components/layout/PageShell";
import {NewAirdrop} from "./NewAirdrop";

export const metadata = {title: "Create an airdrop"};

export default function NewAirdropPage() {
  return (
    <PageShell
      title="Create an airdrop"
      lede="Set aside part of a supply for the people holding it. Each wallet's cut is its share of the holdings that qualify."
    >
      <Suspense fallback={null}>
        <NewAirdrop />
      </Suspense>
    </PageShell>
  );
}
