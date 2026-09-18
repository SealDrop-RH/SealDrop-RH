"use client";

import {useState} from "react";
import {ArrowSquareOut, Check, Copy, DownloadSimple, XLogo} from "@phosphor-icons/react";
import {cn} from "@/lib/cn";
import {MICRO} from "@/components/ui/instrument";
import {Button, buttonClass} from "@/components/ui/primitives";
import {explorerAddressUrl, explorerTxUrl} from "@/lib/chain";

/**
 * The share block, for a lock or an airdrop.
 *
 * Both records produce the same three things: a page anyone can open, a still card, and an
 * animated one. One component for both, because a reader who has shared a lock should not
 * have to learn a second set of controls to share an airdrop.
 *
 * Two images on purpose, and it is worth saying why rather than leaving it to be rediscovered:
 *
 *   - The STILL png is what the page's og:image points at. X, Facebook and LinkedIn all
 *     render a single frame of an animated GIF in a link card, so pointing og:image at the
 *     GIF would cost the still card's sharper text and gain no motion at all.
 *   - The GIF is for a human to download and attach to a post. Attached that way X converts
 *     it to a video and it plays. Discord, Slack and Telegram also animate it inline.
 *
 * So "Save GIF" is the one to reach for when posting, and the button says so.
 *
 * Sharing stays enabled while records are simulated, because a share loop that cannot be
 * used cannot be tested, and testing it end to end is the entire reason it exists in part 1.
 * What makes that safe is the watermark burnt into both images.
 */
export function ShareCard({
  kind,
  id,
  url,
  text,
  txHash,
  contract,
}: {
  kind: "lock" | "airdrop";
  id: string;
  /** The canonical page for this record, absolute. */
  url: string;
  /** What goes in the post alongside the link. */
  text: string;
  txHash?: string;
  contract?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  /** False until the GIF has actually decoded, so the still card holds the frame until then. */
  const [playing, setPlaying] = useState(false);

  /**
   * A lock read back from chain has no creating transaction to point at: the adapter
   * reconstructs it from contract state and stores "0x" in the field. Rendering that as a
   * row gives a copy button for nothing and an explorer link to a page that does not exist,
   * which is worse than saying nothing at all.
   */
  const tx = txHash && txHash.length > 2 ? txHash : undefined;

  const still = kind === "lock" ? `/api/og/proof/${id}` : `/api/og/airdrop/${id}`;
  const animated = kind === "lock" ? `/api/gif/proof/${id}` : `/api/gif/airdrop/${id}`;
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  /**
   * Post with the image attached, as far as each platform allows.
   *
   * X's web intent takes text and a URL and nothing else: there is no parameter that
   * attaches media, and there is no way to add one. So this does the best available thing on
   * each side of the split.
   *
   * Where the browser can share files (phones, and some desktop browsers) the GIF goes into
   * the native share sheet and lands in the composer already attached, which is the thing
   * that was actually asked for.
   *
   * Everywhere else the GIF is saved and the composer opens with the text and link already
   * filled in, leaving one drag. The window is opened synchronously on that path, before any
   * await, because a popup opened after one is blocked.
   */
  async function postOnX() {
    const canShareFiles = typeof navigator !== "undefined" && typeof navigator.share === "function";

    if (!canShareFiles) {
      window.open(intent, "_blank", "noreferrer");
      saveGif();
      return;
    }

    try {
      const response = await fetch(animated);
      const file = new File([await response.blob()], `sealdrop-${id}.gif`, {type: "image/gif"});
      if (navigator.canShare?.({files: [file]})) {
        await navigator.share({files: [file], text, url});
        return;
      }
    } catch {
      // A refused share, an aborted one, or a browser that says it can share files and then
      // cannot. Either way the composer is still worth opening.
    }

    window.open(intent, "_blank", "noreferrer");
    saveGif();
  }

  /** Saves the GIF without navigating, so the composer keeps focus. */
  function saveGif() {
    const link = document.createElement("a");
    link.href = `${animated}?dl=1`;
    link.download = `sealdrop-${id}.gif`;
    document.body.append(link);
    link.click();
    link.remove();
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard access is refused over plain http and in some locked-down browsers.
      // Selecting the field is the fallback that always works.
      const field = document.getElementById("share-url") as HTMLInputElement | null;
      field?.select();
    }
  }

  return (
    <section className="flex flex-col border border-border">
      <div className="flex h-8 items-center justify-between gap-4 border-b border-border px-3 sm:px-4">
        <p className={cn(MICRO, "flex min-w-0 items-center gap-2 text-fg-muted")}>
          <span className="text-accent">Shr. 01</span>
          <span aria-hidden className="text-fg-subtle">
            /
          </span>
          <span className="truncate">Share this {kind}</span>
        </p>
        <p className={cn(MICRO, "hidden shrink-0 text-fg-subtle sm:block")}>Animated card</p>
      </div>

      <div className="flex flex-col gap-4 p-3 sm:p-4">
        {/*
          The still card first, the animated one over it once it arrives.

          The GIF is eighty frames encoded on demand and takes a few seconds to come back,
          which left this box empty and black for the whole wait. The PNG is the same card
          from the same renderer without the frame loop, so it lands almost immediately: the
          reader gets the real thing to look at straight away and it simply starts moving
          when the GIF is ready. A spinner would have filled the same seconds with nothing.

          The box holds the card's aspect ratio, so neither arrival moves the page.

          Plain imgs and not next/image: the optimizer re-encodes what it is given, and a GIF
          through it comes back as a single still frame. Optimizing away the animation is the
          one thing this element must not do.
        */}
        <div className="relative aspect-[1200/630] w-full overflow-hidden bg-bg-elev shadow-[inset_0_0_0_1px_var(--border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={still}
            alt={`Share card for ${id}`}
            className="absolute inset-0 h-full w-full"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={animated}
            // The still underneath carries the description. Both images say the same thing, and
            // announcing it twice is worse than not announcing the moving copy at all.
            alt=""
            aria-hidden
            onLoad={() => setPlaying(true)}
            className={cn(
              "absolute inset-0 h-full w-full transition-opacity duration-[var(--dur-enter)] ease-out",
              playing ? "opacity-100" : "opacity-0",
            )}
          />

          {!playing ? (
            <p
              className={cn(
                MICRO,
                "absolute bottom-0 left-0 m-2 flex items-center gap-2 bg-bg/80 px-2 py-1 text-fg-subtle",
              )}
            >
              <span aria-hidden className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping bg-accent opacity-60" />
                <span className="relative h-1.5 w-1.5 bg-accent" />
              </span>
              Rendering the animation
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => void postOnX()}>
            <XLogo size={13} weight="bold" aria-hidden />
            Post on X with the GIF
          </Button>

          <a
            href={`${animated}?dl=1`}
            className={buttonClass("secondary", "sm")}
            download={`sealdrop-${id}.gif`}
          >
            <DownloadSimple size={13} aria-hidden />
            Save GIF
          </a>

          <a
            href={`${still}?dl=1`}
            className={buttonClass("secondary", "sm")}
            download={`sealdrop-${id}.png`}
          >
            <DownloadSimple size={13} aria-hidden />
            Save PNG
          </a>

          <Button variant="secondary" size="sm" onClick={() => copy(url, "url")}>
            {copied === "url" ? <Check size={13} weight="bold" aria-hidden /> : <Copy size={13} aria-hidden />}
            {copied === "url" ? "Copied" : "Copy link"}
          </Button>

          <a href={url} className={buttonClass("ghost", "sm")}>
            Open page
            <ArrowSquareOut size={11} aria-hidden />
          </a>
        </div>

        <p className={cn(MICRO, "text-fg-subtle")}>
          On a phone the GIF goes straight into the post. On a desktop it saves and the
          composer opens, so drop it in. Attached, it plays. A plain link shows the still one.
        </p>

        {/* Present so the copy fallback has something to select, and so the URL is visible
            and checkable rather than hidden behind a button. */}
        <input
          id="share-url"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          aria-label={`Link to this ${kind}`}
          className="num h-9 w-full bg-surface-2 px-3 text-[12px] text-fg-muted shadow-[inset_0_0_0_1px_var(--border)]"
        />
      </div>

      {tx || contract ? (
        <div className="border-t border-border">
          <div className="flex h-8 items-center border-b border-border px-3 sm:px-4">
            <p className={cn(MICRO, "text-fg-subtle")}>Check it against the chain</p>
          </div>
          {tx ? (
            <Verify label="Transaction" value={tx} href={explorerTxUrl(tx)} onCopy={copy} copied={copied} />
          ) : null}
          {contract ? (
            <Verify
              label="Contract"
              value={contract}
              href={explorerAddressUrl(contract)}
              onCopy={copy}
              copied={copied}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * One checkable fact: the value, a copy button, and a way out to the explorer.
 *
 * The value is shown in full rather than shortened. This row exists so somebody can verify
 * the record independently, and a truncated hash is not something you can paste anywhere.
 */
function Verify({
  label,
  value,
  href,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  href: string;
  onCopy: (value: string, label: string) => void;
  copied: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0 sm:px-4">
      <span className={cn(MICRO, "shrink-0 text-fg-subtle")}>{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="num min-w-0 truncate text-[11.5px] text-fg-muted">{value}</span>
        <button
          type="button"
          onClick={() => onCopy(value, label)}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="shrink-0 text-fg-subtle transition-colors duration-[var(--dur-micro)] ease-out hover:text-fg"
        >
          {copied === label ? <Check size={12} weight="bold" aria-hidden /> : <Copy size={12} aria-hidden />}
        </button>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${label.toLowerCase()} in the block explorer`}
          className="shrink-0 text-accent transition-opacity duration-[var(--dur-micro)] ease-out hover:opacity-80"
        >
          <ArrowSquareOut size={12} aria-hidden />
        </a>
      </span>
    </div>
  );
}
