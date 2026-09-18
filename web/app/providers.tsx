"use client";

import {useState} from "react";
import {MotionConfig} from "motion/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {RainbowKitProvider, darkTheme} from "@rainbow-me/rainbowkit";
import {WagmiProvider} from "wagmi";
import {wagmiConfig} from "@/lib/wagmi";
import {ToastProvider} from "@/components/ui/toast";
import {ClockProvider} from "@/components/Clock";

/**
 * Provider order matters: wagmi needs react-query, RainbowKit needs wagmi, and everything
 * visual sits inside MotionConfig so one setting governs every animation in the app.
 *
 * RainbowKit is themed rather than restyled. Its accent is read from the live custom
 * property, so the wallet modal follows whichever skin is active instead of being a
 * differently-coloured window that opens on top of the app.
 */
export function Providers({children}: {children: React.ReactNode}) {
  // Created in state, not at module scope: a module-level client is shared across every
  // request on the server, which leaks one user's cached data into another's render.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {queries: {staleTime: 30_000, retry: 1, refetchOnWindowFocus: false}},
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "var(--accent)",
            accentColorForeground: "var(--accent-fg)",
            borderRadius: "medium",
            overlayBlur: "small",
          })}
        >
          {/* "user" means the OS setting governs. Every Motion animation in the app
              degrades at once, so honouring reduced motion is not a thing each component
              has to remember to do. */}
          <MotionConfig reducedMotion="user">
            <ClockProvider>
              <ToastProvider>{children}</ToastProvider>
            </ClockProvider>
          </MotionConfig>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
