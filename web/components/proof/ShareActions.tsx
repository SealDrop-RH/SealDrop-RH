"use client";

import {useState} from "react";
import {ArrowSquareOut, Check, Copy, DownloadSimple, XLogo} from "@phosphor-icons/react";
import {Button, buttonClass} from "@/components/ui/primitives";
import {appUrl} from "@/lib/env";
import {formatPercent, lockedShare} from "@/lib/format";
import type {Lock} from "@/lib/locks/types";

/**
 * Post it, copy it, or save the image.
 *
 * Sharing stays enabled while locks are simulated, because a share loop that cannot be
 * used cannot be tested, and testing it end to end is the entire reason it is built in
 * part 1. What makes that safe is the watermark: a simulated lock says so on the page and
 * inside the image, so a screenshot cannot be passed off as proof of anything.
 */
export function ShareActions({lock}: {lock: Lock}) {
  const [copied, setCopied] = useState(false);
  const share = lockedShare(lock.amount, lock.token.totalSupply);
  const url = `${appUrl}/proof/${lock.id}`;

  const text = lock.simulated
    ? `Simulated: ${formatPercent(share, 1)} of $${lock.token.symbol} supply locked with SealDrop.`
    : `${formatPercent(share, 1)} of $${lock.token.symbol} supply is locked.`;

  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access is refused over plain http and in some locked-down browsers.
      // Selecting the text is the fallback that always works.
      const field = document.getElementById("proof-url") as HTMLInputElement | null;
      field?.select();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <a href={intent} target="_blank" rel="noreferrer" className={buttonClass("primary", "md")}>
          <XLogo size={15} weight="bold" aria-hidden />
          Post on X
        </a>

        <Button variant="secondary" onClick={copy}>
          {copied ? <Check size={15} weight="bold" aria-hidden /> : <Copy size={15} aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </Button>

        <a
          href={`/api/og/proof/${lock.id}?dl=1`}
          className={buttonClass("secondary", "md")}
          download={`pons-lock-${lock.id}.png`}
        >
          <DownloadSimple size={15} aria-hidden />
          Save image
        </a>

        <a href={`/proof/${lock.id}`} className={buttonClass("ghost", "md")}>
          Open proof
          <ArrowSquareOut size={13} aria-hidden />
        </a>
      </div>

      {/* Present so the copy fallback has something to select, and so the URL is visible
          and checkable rather than hidden behind a button. */}
      <input
        id="proof-url"
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        aria-label="Proof link"
        className="num h-9 w-full bg-surface-2 px-3 text-[12px] text-fg-muted shadow-[inset_0_0_0_1px_var(--border)]"
      />
    </div>
  );
}
