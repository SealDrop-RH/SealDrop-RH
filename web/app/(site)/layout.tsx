import {SiteHeader} from "@/components/layout/SiteHeader";
import {SiteFooter} from "@/components/layout/SiteFooter";

/**
 * The public page: the register.
 *
 * Proof pages used to live here too, on the argument that they are what a stranger opens
 * from a post and so should carry the site's header and footer rather than a sidebar full
 * of controls that only mean something to someone with a wallet connected. They now sit in
 * the app shell instead, so a proof opens with the same navigation as everything else and
 * a reader can go straight from checking one lock to the register. The topbar's breadcrumb
 * is what keeps the way back out for a first-time visitor.
 */
export default function SiteLayout({children}: {children: React.ReactNode}) {
  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col">
      <SiteHeader />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      <SiteFooter />
    </div>
  );
}
