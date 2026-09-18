import {describe, expect, it} from "vitest";
import {
  formatAmount,
  formatCompact,
  formatDate,
  formatDateTime,
  formatPercent,
  humanDuration,
  lockedShare,
  shortAddress,
  timeLeft,
} from "@/lib/format";
import {deriveState} from "@/lib/locks/derive";

describe("formatAmount", () => {
  it("groups thousands", () => {
    expect(formatAmount(19_537_128n * 10n ** 18n, 18, 0)).toBe("19,537,128");
  });

  /** The classic off-by-a-decimal: 0.05 rendered as 0.5 because the fraction was not padded. */
  it("pads a small fraction rather than shifting it", () => {
    expect(formatAmount(5n * 10n ** 16n, 18)).toBe("0.05");
    expect(formatAmount(5n * 10n ** 17n, 18)).toBe("0.5");
  });

  it("trims trailing zeros but keeps the integer part", () => {
    expect(formatAmount(10n ** 18n, 18)).toBe("1");
    expect(formatAmount(15n * 10n ** 17n, 18)).toBe("1.5");
  });

  it("handles a supply well past Number.MAX_SAFE_INTEGER", () => {
    expect(formatAmount(10n ** 27n, 18, 0)).toBe("1,000,000,000");
  });

  it("respects non-18 decimals", () => {
    expect(formatAmount(1_500_000_000n, 9)).toBe("1.5");
  });
});

describe("formatCompact", () => {
  it("scales to K, M and B", () => {
    expect(formatCompact(1_500n * 10n ** 18n, 18)).toBe("1.5K");
    expect(formatCompact(19_537_128n * 10n ** 18n, 18)).toBe("20M");
    expect(formatCompact(2_400_000_000n * 10n ** 18n, 18)).toBe("2.4B");
  });
});

describe("lockedShare", () => {
  /** Both operands routinely exceed 2^53, so this must not go through Number first. */
  it("is exact for supplies past Number.MAX_SAFE_INTEGER", () => {
    const supply = 10n ** 27n;
    expect(lockedShare(supply / 2n, supply)).toBeCloseTo(0.5, 6);
    expect(lockedShare((supply * 9437n) / 10_000n, supply)).toBeCloseTo(0.9437, 6);
  });

  it("clamps and survives a zero supply", () => {
    expect(lockedShare(10n, 0n)).toBe(0);
    expect(lockedShare(10n, 10n)).toBe(1);
  });
});

describe("humanDuration", () => {
  it("shows the two largest non-zero units", () => {
    expect(humanDuration(394 * 86400 + 2 * 3600)).toBe("394d 2h");
    expect(humanDuration(2 * 3600 + 14 * 60)).toBe("2h 14m");
    expect(humanDuration(45 * 60)).toBe("45m");
    expect(humanDuration(12)).toBe("12s");
  });

  it("never goes negative", () => {
    expect(humanDuration(-500)).toBe("0s");
  });
});

describe("timeLeft", () => {
  it("counts down and then says unlocked", () => {
    const now = 1_760_000_000_000;
    expect(timeLeft(1_760_000_000 + 3600, now)).toBe("1h");
    expect(timeLeft(1_760_000_000 - 1, now)).toBe("unlocked");
  });
});

describe("dates", () => {
  /**
   * UTC, so the server and the browser agree on first paint and two people reading the same
   * proof see the same date.
   */
  it("renders in UTC regardless of the runtime zone", () => {
    expect(formatDate(1_760_000_000)).toBe("9 Oct 2025");
    expect(formatDateTime(1_760_000_000)).toBe("9 Oct 2025, 08:53 UTC");
  });
});

describe("shortAddress", () => {
  it("keeps enough of both ends to compare two by eye", () => {
    expect(shortAddress("0x88e57A9F8f021Aa24bfC757675D06edFa7f0bFB0")).toBe("0x88e5...bFB0");
  });

  it("leaves a short string alone", () => {
    expect(shortAddress("0x1234")).toBe("0x1234");
  });
});

describe("formatPercent", () => {
  it("pins fraction digits so the server and browser agree", () => {
    expect(formatPercent(0.428312)).toBe("42.83%");
    expect(formatPercent(1)).toBe("100.00%");
  });
});

describe("deriveState", () => {
  const now = 1_760_000_000;

  it("is active before the unlock date and unlockable after", () => {
    expect(deriveState({unlockAt: now + 10}, now)).toBe("active");
    expect(deriveState({unlockAt: now - 10}, now)).toBe("unlockable");
    expect(deriveState({unlockAt: now}, now)).toBe("unlockable");
  });

  it("lets withdrawn win over any date", () => {
    expect(deriveState({unlockAt: now + 10_000, withdrawnAt: now - 5}, now)).toBe("withdrawn");
  });
});
