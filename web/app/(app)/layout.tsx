import {AppSidebar} from "@/components/app/AppSidebar";
import {AppTopbar} from "@/components/app/AppTopbar";

/**
 * The app shell: a fixed rail, a sticky topbar, and the page.
 *
 * A route group, so none of these URLs change. The rail is rendered once here rather than
 * per page, which is what lets it keep its scroll position and stay put while the content
 * beside it navigates.
 */
export default function AppLayout({children}: {children: React.ReactNode}) {
  return (
    <div className="flex min-h-[100dvh] min-w-0">
      <aside
        aria-label="Sections"
        className="sticky top-0 hidden h-[100dvh] w-[212px] shrink-0 border-r border-border lg:block"
      >
        <AppSidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
