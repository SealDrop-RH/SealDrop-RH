import Link from "next/link";
import {PageShell} from "@/components/layout/PageShell";
import {Empty, buttonClass} from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <PageShell title="Not found">
      <Empty
        title="There is nothing at this address"
        body="The link may be wrong, or the lock it pointed at may never have existed."
        action={
          <Link href="/explore" className={buttonClass("secondary", "sm")}>
            Browse locks
          </Link>
        }
      />
    </PageShell>
  );
}
