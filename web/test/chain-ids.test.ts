import {describe, expect, it} from "vitest";
import {recordIndex} from "@/lib/locks/chain-ids";

describe("recordIndex", () => {
  it("turns an app lock id into the contract index", () => {
    expect(recordIndex("lock", "pl_0")).toBe("0");
    expect(recordIndex("lock", "pl_17")).toBe("17");
  });

  it("accepts airdrop ids as bare indices or prefixed", () => {
    expect(recordIndex("airdrop", "1")).toBe("1");
    expect(recordIndex("airdrop", "ad_3")).toBe("3");
  });

  it("refuses ids the chain could not have produced", () => {
    expect(recordIndex("lock", "pl_7k2m9q")).toBeNull();
    expect(recordIndex("lock", "ad_1")).toBeNull();
  });
});
