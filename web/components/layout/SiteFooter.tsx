import Link from "next/link";
import {ArrowUpRight} from "@phosphor-icons/react/dist/ssr";
import {Logo} from "@/components/brand/Logo";
import {activeChain, explorerUrl} from "@/lib/chain";
import {locksAdapterKind} from "@/lib/env";

/**
 * The footer.
 *
 * Every link goes somewhere that exists. A column of plausible-looking links to pages that
 * were never built is the cheapest way to make a product look bigger than it is and the
 * fastest way to lose the trust the rest of the page is arguing for, which for this product
 * is the whole pitch.
 */
const COLUMNS: Array<{title: string; links: Array<{label: string; href: string; external?: boolean}>}> = [
  {
    title: "PRODUCT",
    links: [
      {label: "Lock supply", href: "/lock"},
      {label: "Explore locks", href: "/explore"},
      {label: "My locks", href: "/me"},
    ],
  },
  {
    title: "CHECK A TOKEN",
    links: [
      {label: "Is it locked?", href: "/explore?state=active"},
      {label: "Can it be unlocked yet?", href: "/explore?state=unlockable"},
      {label: "Was it withdrawn?", href: "/explore?state=withdrawn"},
    ],
  },
  {
    title: "CHAIN",
    links: [
      {label: "Block explorer", href: explorerUrl, external: true},
      {label: "Robinhood Chain", href: "https://chain.robinhood.com", external: true},
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-auto overflow-hidden shadow-[inset_0_1px_0_var(--border)]">
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-2.5">
              <Logo size={22} />
              <span className="display text-[15px] font-semibold tracking-tight text-fg">
                SealDrop
              </span>
            </p>
            <p className="max-w-[38ch] text-[13px] leading-relaxed text-fg-muted">
              Supply locks on {activeChain.name}. Locked tokens can only be withdrawn by the
              wallet that locked them, and only after the date it chose.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} className="flex flex-col gap-3" aria-label={column.title}>
              <p className="num text-[10px] tracking-wider text-fg-subtle">{column.title}</p>
              <ul className="flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[13px] text-fg-muted transition-colors duration-[var(--dur-micro)] ease-out hover:text-fg"
                      >
                        {link.label}
                        <ArrowUpRight size={11} aria-hidden />
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-[13px] text-fg-muted transition-colors duration-[var(--dur-micro)] ease-out hover:text-fg"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-3 pt-7 shadow-[inset_0_1px_0_var(--border)] sm:flex-row sm:items-center sm:justify-between">
          <p className="num text-[11px] tracking-wide text-fg-subtle">
            SEALDROP · {activeChain.name.toUpperCase()} · {activeChain.id}
          </p>
          {locksAdapterKind === "mock" ? (
            <p className="text-[12px] text-warn">
              Simulated. No lock contract is deployed yet, so nothing here is on chain.
            </p>
          ) : null}
        </div>
      </div>

      {/* A wordmark cut into the floor. Sits behind the content, is not text anyone needs to
          read, and is clipped by the footer rather than adding height to it. */}
      <p aria-hidden className="footer-wordmark display">
        SEALDROP
      </p>
    </footer>
  );
}
