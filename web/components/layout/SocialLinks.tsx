"use client";

import {ArrowUpRight, GithubLogo, XLogo} from "@phosphor-icons/react";
import {cn} from "@/lib/cn";
import {MICRO} from "@/components/ui/instrument";
import {SEAL_TOKEN, SOCIAL} from "@/lib/social";

const LINKS = [
  {...SOCIAL.github, icon: GithubLogo},
  {...SOCIAL.x, icon: XLogo},
];

/**
 * The $SEAL ticker, then the project's GitHub and X, as links out.
 *
 * Two shapes, because the two places these sit have different jobs:
 *
 *   - `icons`, in a header bar, where the room is a few dozen pixels and a pointer is
 *     precise. Icon only, so each one carries its destination as an aria-label; a bare glyph
 *     with no name is announced as "link" and nothing else.
 *   - `rows`, in a mobile menu, where a thumb is doing the aiming. Labelled, and 44px tall,
 *     which is the touch floor the rest of the app holds to.
 *
 * Everything here opens in a new tab. Somebody checking a lock and glancing at the repository
 * or the token should not lose the proof they were looking at.
 */
export function SocialLinks({variant = "icons", className}: {variant?: "icons" | "rows"; className?: string}) {
  if (variant === "rows") {
    return (
      <div className={cn("flex flex-col", className)}>
        <TokenRow />
        {LINKS.map(({label, href, icon: Icon}) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "flex h-11 items-center gap-2.5 px-2 text-sm text-fg-muted",
              "transition-colors duration-[var(--dur-micro)] ease-out hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon size={16} aria-hidden className="shrink-0" />
            <span>{label}</span>
            <ArrowUpRight size={11} aria-hidden className="ml-auto text-fg-subtle" />
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", className)}>
      <TokenChip />
      {LINKS.map(({label, href, icon: Icon}) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`SealDrop on ${label}, opens in a new tab`}
          title={label}
          className={cn(
            "flex h-9 w-9 items-center justify-center text-fg-subtle",
            "transition-[color,transform] duration-[var(--dur-micro)] ease-out hover:text-fg active:scale-[0.97]",
          )}
        >
          <Icon size={17} aria-hidden />
        </a>
      ))}
    </div>
  );
}

/**
 * The ticker in the header bar.
 *
 * Live, it links to the token's launchpad page and carries the accent: it is the project's
 * own token and the one thing in this cluster that is a call to act rather than a place to
 * read. Before the address exists it is set in the subdued caption grade with SOON beside it
 * and is not focusable, the same treatment the sidebar gives Vesting.
 */
function TokenChip() {
  const ticker = `$${SEAL_TOKEN.symbol}`;

  if (!SEAL_TOKEN.href) {
    return (
      <span
        className={cn(MICRO, "mr-1 flex h-9 cursor-default items-center gap-1.5 px-2 text-fg-subtle")}
        aria-disabled
        title={`${ticker} is not live yet`}
      >
        <span className="num normal-case tracking-normal">{ticker}</span>
        <span className="app-soon">SOON</span>
      </span>
    );
  }

  return (
    <a
      href={SEAL_TOKEN.href}
      target="_blank"
      rel="noreferrer"
      aria-label={`${ticker} on the Pons launchpad, opens in a new tab`}
      className={cn(
        MICRO,
        "mr-1 flex h-9 items-center gap-1 px-2 text-accent",
        "transition-[opacity,transform] duration-[var(--dur-micro)] ease-out hover:opacity-80 active:scale-[0.97]",
      )}
    >
      <span className="num normal-case tracking-normal">{ticker}</span>
      <ArrowUpRight size={10} aria-hidden />
    </a>
  );
}

/** The ticker as a menu row, for the same two states. */
function TokenRow() {
  const ticker = `$${SEAL_TOKEN.symbol}`;
  const shared = "flex h-11 items-center gap-2.5 px-2 text-sm";

  if (!SEAL_TOKEN.href) {
    return (
      <span className={cn(shared, "cursor-default text-fg-subtle")} aria-disabled>
        <span className="num">{ticker}</span>
        <span className="app-soon">SOON</span>
      </span>
    );
  }

  return (
    <a
      href={SEAL_TOKEN.href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        shared,
        "text-accent transition-colors duration-[var(--dur-micro)] ease-out hover:bg-surface-2",
      )}
    >
      <span className="num">{ticker}</span>
      <span className="text-fg-muted">on Pons</span>
      <ArrowUpRight size={11} aria-hidden className="ml-auto text-fg-subtle" />
    </a>
  );
}

/** A caption for the rows variant, so the group reads as the project's rather than as nav. */
export function SocialHeading({className}: {className?: string}) {
  return <p className={cn(MICRO, "px-2 pb-1 pt-3 text-fg-subtle", className)}>Elsewhere</p>;
}
