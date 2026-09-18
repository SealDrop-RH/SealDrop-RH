"use client";

import {createContext, useContext, useEffect, useState} from "react";

/**
 * One ticking clock for the whole page.
 *
 * Every countdown on /explore would otherwise own a setInterval, so a page of twenty locks
 * would run twenty timers that drift apart and re-render independently. One context ticks,
 * everything reads it, and they all agree.
 *
 * A second is the resolution: the unit displayed is never finer than that.
 */
/** Only reached outside a provider, which is a mistake rather than a supported mode. */
const ClockContext = createContext<number>(0);

export function ClockProvider({children}: {children: React.ReactNode}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>;
}

/** Milliseconds since epoch, updated once a second. */
export function useClock(): number {
  const now = useContext(ClockContext);
  if (now === 0 && process.env.NODE_ENV !== "production") {
    throw new Error("useClock must be used inside <ClockProvider>");
  }
  return now;
}
