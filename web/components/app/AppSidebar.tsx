"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {
  ArrowUpRight,
  ArrowsLeftRight,
  Broadcast,
  LockSimple,
  MagnifyingGlass,
  SquaresFour,
  Wallet,
} from "@phosphor-icons/react";
import {Logo} from "@/components/brand/Logo";
import {activeChain} from "@/lib/chain";
import {cn} from "@/lib/cn";
import {MICRO} from "@/components/ui/instrument";
import {SocialLinks} from "@/components/layout/SocialLinks";

/**
 * The app's navigation rail.
 *
 * Two groups: where you look at things, and what you can do. Items that do not exist yet are
 * shown disabled and labelled, rather than left off or linked to a page that would 404. A
 * greyed row with SOON on it is information; a link that goes nowhere is a bug.
 *
 * Square, hairline-separated and set in the caption grade, so the rail reads as part of the
 * same instrument as the screen beside it. The active row is marked with an accent edge
 * rather than a filled pill: a pill is a shape borrowed from a different product, and the
 * one thing allowed to carry the accent on this rail is the thing you are looking at.
 */

const OVERVIEW = [
  {href: "/dashboard", label: "Dashboard", icon: SquaresFour},
  {href: "/explore", label: "Explore / Verify", icon: MagnifyingGlass},
  {href: "/me", label: "My locks", icon: Wallet},
];

const PRODUCTS = [
  {href: "/lock", label: "Supply locks", icon: LockSimple, state: "live" as const},
  {href: "/airdrops", label: "Airdrops", icon: Broadcast, state: "live" as const},
  {href: null, label: "Vesting", icon: ArrowsLeftRight, state: "soon" as const},
];

export function AppSidebar({onNavigate}: {onNavigate?: () => void}) {
  return (
    <div className="flex h-full flex-col">
      <Link
        href="/"
        onClick={onNavigate}
        aria-label="SealDrop, home"
        className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4"
      >
        <Logo size={20} />
        <span className="display text-[14px] font-semibold tracking-tight text-fg">SealDrop</span>
      </Link>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-4">
        <Group title="Overview">
          {OVERVIEW.map((item) => (
            <Item key={item.href} {...item} onNavigate={onNavigate} />
          ))}
        </Group>

        <Group title="Products">
          {PRODUCTS.map((item) => (
            <Item key={item.label} {...item} onNavigate={onNavigate} />
          ))}
        </Group>
      </div>

      {/* Below lg this rail only ever appears as the mobile drawer, and below sm the topbar
          hides its icons, so this is where a phone finds them. At lg and up the rail is
          permanent and the topbar is already showing both, so the copy here would be a
          duplicate sitting a few hundred pixels from the original. */}
      <SocialLinks variant="rows" className="shrink-0 border-t border-border px-2 py-2 lg:hidden" />

      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-4">
        <span className={cn(MICRO, "flex items-center gap-2 text-fg-subtle")}>
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-positive" />
          <span className="num truncate text-[10px] normal-case tracking-normal text-fg-muted">
            {activeChain.name} / {activeChain.id}
          </span>
        </span>
        <Link
          href="/"
          onClick={onNavigate}
          className={cn(
            MICRO,
            "inline-flex items-center gap-1 text-fg-subtle transition-colors duration-[var(--dur-micro)] ease-out hover:text-fg",
          )}
        >
          sealdrop.family
          <ArrowUpRight size={10} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function Group({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <nav className="flex flex-col" aria-label={title}>
      <p className={cn(MICRO, "px-4 pb-2 text-fg-subtle")}>{title}</p>
      {children}
    </nav>
  );
}

function Item({
  href,
  label,
  icon: Icon,
  state,
  onNavigate,
}: {
  href: string | null;
  label: string;
  icon: typeof LockSimple;
  state?: "live" | "soon";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = href !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const body = (
    <>
      <Icon size={14} weight={active ? "fill" : "regular"} aria-hidden className="shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
      {state === "live" ? <span className="app-live">LIVE</span> : null}
      {state === "soon" ? <span className="app-soon">SOON</span> : null}
    </>
  );

  // The 2px edge is reserved on every row, transparent until the row is the current one, so
  // becoming active shifts nothing sideways.
  const shared = cn(
    "flex h-9 items-center gap-2.5 border-l-2 px-4 text-[12.5px]",
    "transition-colors duration-[var(--dur-micro)] ease-out",
  );

  if (href === null) {
    return (
      // Not a link and not a button: there is nowhere to go yet, and making it focusable
      // would put a dead stop in the keyboard path.
      <span className={cn(shared, "cursor-default border-transparent text-fg-subtle")} aria-disabled>
        {body}
      </span>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        shared,
        active
          ? "border-accent bg-surface-2 text-fg"
          : "border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {body}
    </Link>
  );
}
