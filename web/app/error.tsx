"use client";

import {useEffect} from "react";
import {PageShell} from "@/components/layout/PageShell";
import {Button, Empty} from "@/components/ui/primitives";

export default function ErrorBoundary({error, reset}: {error: Error; reset: () => void}) {
  useEffect(() => {
    // Nothing is wired to a reporter yet, so at least leave a trace in the console rather
    // than swallowing the only copy of what went wrong.
    console.error(error);
  }, [error]);

  return (
    <PageShell title="Something broke">
      <Empty
        title="This page did not load"
        // error.message is deliberately not printed: it can carry internals, and it is
        // never the thing the person reading it can act on.
        body="Trying again usually works. If it does not, the error is in the browser console."
        action={
          <Button variant="secondary" size="sm" onClick={reset}>
            Try again
          </Button>
        }
      />
    </PageShell>
  );
}
