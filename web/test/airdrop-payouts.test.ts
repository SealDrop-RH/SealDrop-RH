import {describe, expect, it} from "vitest";
import {SHARE_SCALE, payoutFor} from "@/lib/airdrops/allocations";
import {isWalletCode} from "@/lib/airdrops/holders";

const E18 = 10n ** 18n;
const pct = (n: bigint) => (SHARE_SCALE * n) / 100n;

describe("payoutFor", () => {
  it("sends a steady holder exactly what built up since their last payout", () => {
    // 10,000 released, 9,000 of it already paid out in proportion; this holder has half.
    const amount = payoutFor({
      released: 10_000n * E18,
      room: 1_000n * E18,
      share: pct(50n),
      taken: 4_500n * E18,
      settling: false,
    });
    expect(amount).toBe(500n * E18);
  });

  it("sends a late buyer their share of what is left, not their share of all history", () => {
    // Owed 2,000 on paper (20% of 10,000, nothing taken), but only 1,000 is left to pay.
    const amount = payoutFor({
      released: 10_000n * E18,
      room: 1_000n * E18,
      share: pct(20n),
      taken: 0n,
      settling: false,
    });
    expect(amount).toBe(200n * E18);
  });

  it("never sends more than a holder is owed, however much is left", () => {
    // A holder whose share shrank was paid more than their new share is worth.
    const amount = payoutFor({
      released: 10_000n * E18,
      room: 1_000n * E18,
      share: pct(40n),
      taken: 3_900n * E18,
      settling: false,
    });
    expect(amount).toBe(100n * E18);
  });

  it("sends nothing to a holder already paid past their entitlement", () => {
    expect(
      payoutFor({released: 10_000n * E18, room: 1_000n * E18, share: pct(40n), taken: 5_000n * E18, settling: false}),
    ).toBe(0n);
  });

  it("settles in full once nothing more will be released, capped by what is left", () => {
    const args = {released: 10_000n * E18, room: 1_000n * E18, share: pct(20n), taken: 0n};
    expect(payoutFor({...args, settling: true})).toBe(1_000n * E18);
    expect(payoutFor({...args, room: 5_000n * E18, settling: true})).toBe(2_000n * E18);
  });

  it("never splits more than is left across a whole tree", () => {
    const room = 777_777n;
    const shares = [pct(37n), pct(33n), pct(30n)];
    const total = shares.reduce(
      (sum, share) => sum + payoutFor({released: 10n ** 30n, room, share, taken: 0n, settling: false}),
      0n,
    );
    expect(total <= room).toBe(true);
  });
});

describe("isWalletCode", () => {
  it("counts an ordinary account", () => {
    expect(isWalletCode("0x")).toBe(true);
    expect(isWalletCode(undefined)).toBe(true);
  });

  it("counts an EIP-7702 delegated account, like both operator wallets", () => {
    expect(isWalletCode("0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b")).toBe(true);
  });

  it("drops a contract, like the bonding curve that swallowed the first $DROP drip", () => {
    expect(isWalletCode("0x6080604052348015600e575f80fd5b50")).toBe(false);
    // Starts like a delegation but is not one: the length is what makes it a pointer.
    expect(isWalletCode("0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b00")).toBe(false);
  });
});
