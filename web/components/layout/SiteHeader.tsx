"use client";

import {useState} from "react";
import Link from "next/link";
import {List, X} from "@phosphor-icons/react";
import {Logo} from "@/components/brand/Logo";
import {NavLink} from "./NavLink";
import {WalletButton} from "./WalletButton";
import {SocialHeading, SocialLinks} from "./SocialLinks";
import {cn} from "@/lib/cn";

const NAV = [
  {href: "/lock", label: "Lock"},
  {href: "/explore", label: "Explore"},
  {href: "/me", label: "My locks"},
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    // 64px, inside the 80px cap. A header that eats a tenth of the viewport is a header
    // that is competing with the page.
    <header className="sticky top-0 z-30 h-16 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="SealDrop, home"
          className="flex shrink-0 items-center gap-2.5"
        >
          <Logo size={22} />
          <span className="display text-[15px] font-semibold tracking-tight text-fg">
            SealDrop
          </span>
        </Link>

        {/* Single line at desktop. Below that it collapses rather than wrapping to two. */}
        <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Hidden below sm: at 320px the logo, wallet and menu toggle already fill the bar,
              and two more buttons would push it sideways. They move into the menu instead. */}
          <SocialLinks className="hidden sm:flex" />
          <WalletButton />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 items-center justify-center text-fg-muted transition-[transform,color] duration-[var(--dur-micro)] ease-out hover:text-fg active:scale-[0.97] sm:hidden"
          >
            {open ? <X size={18} aria-hidden /> : <List size={18} aria-hidden />}
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        hidden={!open}
        className="bg-bg px-4 pb-4 shadow-[inset_0_1px_0_var(--border)] sm:hidden"
      >
        <nav className="flex flex-col py-2" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "px-2 py-3 text-sm text-fg-muted",
                "transition-colors duration-[var(--dur-micro)] ease-out hover:bg-surface-2 hover:text-fg",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="shadow-[inset_0_1px_0_var(--border)]">
          <SocialHeading />
          <SocialLinks variant="rows" />
        </div>
      </div>
    </header>
  );
}
