import type {Metadata, Viewport} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import {SKIN} from "@/lib/skins";
import {appUrl} from "@/lib/env";
import {DevPanel} from "@/components/dev/DevPanel";
import {Providers} from "./providers";
import "./globals.css";

/**
 * Geist and Geist Mono load through next/font: self-hosted, preloaded, no FOUT. Geist Mono
 * carries every number, address and hash; Geist carries everything else.
 */
const geist = Geist({variable: "--font-geist", subsets: ["latin"], display: "swap"});
const geistMono = Geist_Mono({variable: "--font-geist-mono", subsets: ["latin"], display: "swap"});

const DESCRIPTION = "Lock token supply on Robinhood Chain and get a proof anyone can check.";

export const metadata: Metadata = {
  // Without this, Next has no origin to resolve app/opengraph-image.png against and drops
  // the tag rather than emitting a relative one, so the site's own link preview silently
  // renders blank while every per-record card keeps working. lib/env.ts explains the
  // fallback order behind appUrl.
  metadataBase: new URL(appUrl),
  title: {default: "SealDrop", template: "%s · SealDrop"},
  description: DESCRIPTION,
  applicationName: "SealDrop",
  // app/opengraph-image.png and app/twitter-image.png are picked up by file convention and
  // do not need to be named here. Routes that build their own card, which is every proof
  // and every airdrop, set openGraph.images in generateMetadata and override these.
  openGraph: {type: "website", siteName: "SealDrop", title: "SealDrop", description: DESCRIPTION, url: "/"},
  twitter: {card: "summary_large_image", title: "SealDrop", description: DESCRIPTION},
};

export const viewport: Viewport = {
  // The browser paints its chrome from this before any CSS is parsed, so it is the one
  // place a real value has to be handed over rather than a custom property. It comes from
  // lib/skins.ts, which test/tokens.test.ts holds equal to globals.css.
  themeColor: SKIN.bg,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      {/* suppressHydrationWarning because extensions inject attributes onto <body> before
          React hydrates. ColorZilla adds cz-shortcut-listen, Grammarly adds its own, and each
          one raises a hydration error that is not about this app and cannot be fixed from
          here. It is scoped to this element, so a genuine mismatch anywhere inside still
          reports normally. */}
      <body className="antialiased" suppressHydrationWarning>
        <Providers>
          {children}
          <DevPanel />
        </Providers>
      </body>
    </html>
  );
}
