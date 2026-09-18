import {describe, expect, it} from "vitest";
import {caretAfterGrouping, cleanAmountText, formatAmountGrouped, groupDigits, parseAmount} from "@/lib/locks/parse";

describe("groupDigits", () => {
  it("puts separators on the whole part", () => {
    expect(groupDigits("1000000")).toBe("1,000,000");
    expect(groupDigits("999")).toBe("999");
    expect(groupDigits("1000")).toBe("1,000");
  });

  it("leaves the fraction exactly as typed, trailing zeros included", () => {
    expect(groupDigits("1234567.50")).toBe("1,234,567.50");
    expect(groupDigits("12345.")).toBe("12,345.");
    expect(groupDigits("0.000123")).toBe("0.000123");
  });

  it("round-trips through the parser the forms already use", () => {
    const grouped = formatAmountGrouped(1_234_567_890_000_000_000_000_000n, 18);
    expect(grouped).toBe("1,234,567.89");
    const parsed = parseAmount(grouped, 18);
    expect(typeof parsed !== "string" && parsed.raw).toBe(1_234_567_890_000_000_000_000_000n);
  });
});

describe("cleanAmountText", () => {
  it("drops typed or pasted separators", () => {
    expect(cleanAmountText("1,000,000", 18)).toBe("1000000");
    expect(cleanAmountText(" 25 000 ", 18)).toBe("25000");
  });

  it("refuses anything that is not an amount", () => {
    expect(cleanAmountText("12a", 18)).toBeNull();
    expect(cleanAmountText("1.2.3", 18)).toBeNull();
    expect(cleanAmountText("-5", 18)).toBeNull();
  });

  it("refuses more decimal places than the token has", () => {
    expect(cleanAmountText("1.123", 2)).toBeNull();
    expect(cleanAmountText("1.12", 2)).toBe("1.12");
    expect(cleanAmountText("1.", 0)).toBeNull();
  });

  it("tidies leading zeros without eating the one before a point", () => {
    expect(cleanAmountText("007", 18)).toBe("7");
    expect(cleanAmountText(".5", 18)).toBe("0.5");
    expect(cleanAmountText("0.5", 18)).toBe("0.5");
    expect(cleanAmountText("", 18)).toBe("");
  });
});

describe("caretAfterGrouping", () => {
  it("keeps the caret after the same digit when a comma appears before it", () => {
    // Typed the 4th digit at the end of "100": "1000" becomes "1,000", caret at the end.
    expect(caretAfterGrouping("1000", 4, "1,000")).toBe(5);
  });

  it("keeps the caret in the middle when editing inside a number", () => {
    // "1,000,000" with a 5 typed after the first digit: "15,000,000" -> "15,000,000", caret after 5.
    expect(caretAfterGrouping("15,000,000", 2, "15,000,000")).toBe(2);
    // "12,345" with 9 typed after "12,3": "12,3945" -> "123,945", caret after the 9.
    expect(caretAfterGrouping("12,3945", 5, "123,945")).toBe(5);
  });

  it("puts a caret at the start back at the start", () => {
    expect(caretAfterGrouping("5000", 0, "5,000")).toBe(0);
  });
});
