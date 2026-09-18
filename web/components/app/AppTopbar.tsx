"use client";

import {useState} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {List, X} from "@phosphor-icons/react";
import {WalletButton} from "@/components/layout/WalletButton";
import {SocialLinks} from "@/components/layout/SocialLinks";
import {AppSidebar} from "./AppSidebar";

/**
 * Breadcrumb on the left, wallet on the right, and the sidebar behind a button on narrow
 * screens.
 *
 * The breadcrumb is derived from the path rather than passed down, so a new route cannot
 * ship with a stale label on it.
 */
const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  lock: "Lock supply",
  airdrops: "Airdrops",
  new: "New",
  success: "Locked",
  explore: "Explore / Verify",
  me: "My locks",
};

export function AppTopbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const crumbs = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => LABELS[segment] ?? segment);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
      {/* 48px, the same height as the sidebar's wordmark block, so the two hairlines meet
          in one unbroken line across the top of the app. */}
      <div className="flex h-12 items-center gap-3 px-3 sm:px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="flex h-8 w-8 items-center justify-center text-fg-muted transition-[transform,color] duration-[var(--dur-micro)] ease-out hover:text-fg active:scale-[0.97] lg:hidden"
        >
          <List size={16} aria-hidden />
        </button>

        <nav
          aria-label="Breadcrumb"
          className="font-mono min-w-0 truncate text-[10px] uppercase leading-none tracking-[0.14em]"
        >
          <Link href="/" className="text-fg-subtle transition-colors duration-[var(--dur-micro)] ease-out hover:text-fg">
            SEALDROP
          </Link>
          {crumbs.map((crumb, i) => (
            <span key={crumb}>
              <span className="px-2 text-fg-subtle" aria-hidden>
                /
              </span>
              <span className={i === crumbs.length - 1 ? "text-fg" : "text-fg-subtle"}>
                {crumb.toUpperCase()}
              </span>
            </span>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SocialLinks className="hidden sm:flex" />
          <WalletButton />
        </div>
      </div>

      {/* The rail as an overlay below lg. Rendered only while open, so its links are not in
          the keyboard path of a page that is not showing them. */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 w-[min(82vw,272px)] bg-bg shadow-[var(--shadow-2)]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center text-fg-muted hover:text-fg"
            >
              <X size={16} aria-hidden />
            </button>
            <AppSidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
