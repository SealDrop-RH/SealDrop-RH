"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {cn} from "@/lib/cn";

export function NavLink({href, children}: {href: string; children: React.ReactNode}) {
  const pathname = usePathname();
  // Exact match for "/", prefix match elsewhere, so /proof/pl_x still lights up nothing and
  // /explore stays active on its own sub-routes.
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "px-2 py-1 text-[13.5px] transition-colors duration-[var(--dur-micro)] ease-out",
        active ? "text-fg" : "text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
