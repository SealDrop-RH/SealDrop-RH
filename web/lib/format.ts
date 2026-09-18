/**
 * Formatting for on-chain values.
 *
 * Every function here is pure and runs identically on the server and in the browser, which
 * matters more than it sounds: a number formatted differently in the two places produces a
 * hydration mismatch, and Intl is exactly where that happens. Fraction digits are always
 * pinned for that reason.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Raw units to a display string, grouped, never in exponent notation. */
export function formatAmount(raw: bigint, decimals: number, maxFractionDigits = 4): string {
  const negative = raw < 0n;
  const value = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;

  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (fraction === 0n || maxFractionDigits === 0) return `${negative ? "-" : ""}${wholeText}`;

  // Padded to the token's full precision, then trimmed, so 0.05 never renders as 0.5.
  const fractionText = fraction.toString().padStart(decimals, "0").slice(0, maxFractionDigits).replace(/0+$/, "");
  return `${negative ? "-" : ""}${wholeText}${fractionText ? `.${fractionText}` : ""}`;
}

/** 19,537,128.79 becomes "19.5M". For headline figures where precision is noise. */
export function formatCompact(raw: bigint, decimals: number): string {
  const units = Number(raw / 10n ** BigInt(decimals));
  if (units >= 1_000_000_000) return `${(units / 1_000_000_000).toFixed(units >= 10_000_000_000 ? 0 : 1)}B`;
  if (units >= 1_000_000) return `${(units / 1_000_000).toFixed(units >= 10_000_000 ? 0 : 1)}M`;
  if (units >= 1_000) return `${(units / 1_000).toFixed(units >= 10_000 ? 0 : 1)}K`;
  return units.toLocaleString("en-US");
}

/**
 * A share of supply as a percentage.
 *
 * Computed in bigint before touching Number: amount and totalSupply are both routinely
 * past 2^53, so dividing them as Numbers first loses the answer.
 */
export function lockedShare(amount: bigint, totalSupply: bigint): number {
  if (totalSupply <= 0n) return 0;
  const scaled = (amount * 1_000_000n) / totalSupply;
  return Math.min(1, Number(scaled) / 1_000_000);
}

/** 0.4283 becomes "42.83%". Digits pinned so the server and the browser agree. */
export function formatPercent(share: number, fractionDigits = 2): string {
  return `${(share * 100).toFixed(fractionDigits)}%`;
}

/** 0x88e5...bFB0. Enough of both ends to compare two by eye. */
export function shortAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 2) return address;
  return `${address.slice(0, lead)}...${address.slice(-tail)}`;
}

/** "394d 2h", "2h 14m", "45m", "12s". The largest two units that are not zero. */
export function humanDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const d = Math.floor(total / DAY);
  const h = Math.floor((total % DAY) / HOUR);
  const m = Math.floor((total % HOUR) / MINUTE);
  const s = total % MINUTE;

  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

/** Time until a unix-seconds deadline, or "unlocked" once it has passed. */
export function timeLeft(unlockAt: number, nowMs: number): string {
  const remaining = unlockAt - Math.floor(nowMs / 1000);
  return remaining <= 0 ? "unlocked" : humanDuration(remaining);
}

/**
 * A fixed date, in UTC.
 *
 * UTC on purpose. A lock's unlock moment is a single instant that everyone looking at the
 * proof has to agree on, and rendering it in the reader's zone means the server and the
 * browser disagree on first paint and two people reading the same proof see two dates.
 */
export function formatDate(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    date.getUTCMonth()
  ];
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

/** Date plus time, for the review panel where the exact moment is being agreed to. */
export function formatDateTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(unixSeconds)}, ${hh}:${mm} UTC`;
}
