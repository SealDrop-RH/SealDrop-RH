import {describe, expect, it} from "vitest";
import {
  formatAmountInput,
  normaliseAddress,
  parseAmount,
  parseUnlockDate,
  toDateTimeLocal,
} from "@/lib/locks/parse";

describe("parseAmount", () => {
  it("converts a decimal string to raw units exactly", () => {
    expect(parseAmount("1.5", 18)).toEqual({raw: 1_500_000_000_000_000_000n});
    expect(parseAmount("1", 18)).toEqual({raw: 10n ** 18n});
    expect(parseAmount("0.000000000000000001", 18)).toEqual({raw: 1n});
  });

  /** Via parseFloat this is wrong by a few wei, and the only symptom is a revert. */
  it("stays exact on a value Number cannot hold", () => {
    const parsed = parseAmount("19537128.786868123456789012", 18);
    expect(parsed).toEqual({raw: 19_537_128_786_868_123_456_789_012n});
  });

  it("accepts grouped input, since that is what people paste", () => {
    expect(parseAmount("19,537,128", 18)).toEqual({raw: 19_537_128n * 10n ** 18n});
  });

  it("respects a token's own decimals", () => {
    expect(parseAmount("1.5", 9)).toEqual({raw: 1_500_000_000n});
    expect(parseAmount("1.5", 0)).toBe("too-many-decimals");
  });

  it("names what is wrong rather than returning null", () => {
    expect(parseAmount("", 18)).toBe("empty");
    expect(parseAmount("abc", 18)).toBe("not-a-number");
    expect(parseAmount(".", 18)).toBe("not-a-number");
    expect(parseAmount("-5", 18)).toBe("not-a-number");
    expect(parseAmount("1.1234567890123456789", 18)).toBe("too-many-decimals");
  });

  it("round-trips through the input formatter", () => {
    for (const text of ["1", "1.5", "0.05", "19537128.786868"]) {
      const parsed = parseAmount(text, 18);
      expect(typeof parsed).toBe("object");
      expect(formatAmountInput((parsed as {raw: bigint}).raw, 18)).toBe(text);
    }
  });
});

describe("normaliseAddress", () => {
  it("accepts a checksummed address and rejects nonsense", () => {
    expect(normaliseAddress(" 0x88e57A9F8f021Aa24bfC757675D06edFa7f0bFB0 ")).toBe(
      "0x88e57A9F8f021Aa24bfC757675D06edFa7f0bFB0",
    );
    expect(normaliseAddress("0x123")).toBeNull();
    expect(normaliseAddress("not an address")).toBeNull();
  });
});

describe("unlock dates", () => {
  it("round-trips through the datetime-local format", () => {
    const seconds = Math.floor(new Date(2027, 2, 12, 14, 30).getTime() / 1000);
    expect(parseUnlockDate(toDateTimeLocal(seconds))).toBe(seconds);
  });

  it("returns null rather than NaN for empty or malformed input", () => {
    expect(parseUnlockDate("")).toBeNull();
    expect(parseUnlockDate("not a date")).toBeNull();
  });
});
