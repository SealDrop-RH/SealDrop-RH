import {Suspense} from "react";
import {PageShell} from "@/components/layout/PageShell";
import {LockSuccess} from "./LockSuccess";

export const metadata = {title: "Locked"};

export default function LockSuccessPage() {
  return (
    <PageShell title="Locked" lede="Here is the proof. The link below opens for anyone.">
      {/* useSearchParams needs a Suspense boundary, or the whole route opts out of static
          rendering. */}
      <Suspense fallback={null}>
        <LockSuccess />
      </Suspense>
    </PageShell>
  );
}
