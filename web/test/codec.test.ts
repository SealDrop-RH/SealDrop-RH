import {describe, expect, it} from "vitest";
import {deserialiseLock, deserialiseLocks, serialiseLock, serialiseLocks} from "@/lib/locks/codec";
import {fixtureLocks} from "@/lib/locks/fixtures";

const lock = fixtureLocks(1_760_000_000)[0];

describe("codec", () => {
  it("round-trips a lock without losing bigint precision", () => {
    const back = deserialiseLock(serialiseLock(lock));
    expect(back.amount).toBe(lock.amount);
    expect(back.token.totalSupply).toBe(lock.token.totalSupply);
    expect(back).toEqual(lock);
  });

  /** The bug this whole module exists to prevent. */
  it("survives JSON.stringify, which throws on a raw bigint", () => {
    expect(() => JSON.stringify(lock)).toThrow();
    expect(() => JSON.stringify(serialiseLock(lock))).not.toThrow();
  });

  it("keeps a supply past Number.MAX_SAFE_INTEGER exact", () => {
    const huge = {...lock, amount: 123_456_789_012_345_678_901_234_567_890n};
    expect(deserialiseLock(serialiseLock(huge)).amount).toBe(huge.amount);
  });

  it("drops a corrupt record rather than losing the whole list", () => {
    const good = JSON.parse(serialiseLocks([lock]));
    const mixed = JSON.stringify([...good, {id: "broken"}, ...good]);
    expect(deserialiseLocks(mixed)).toHaveLength(2);
  });

  it("treats missing or unparseable storage as empty", () => {
    expect(deserialiseLocks(null)).toEqual([]);
    expect(deserialiseLocks("not json")).toEqual([]);
    expect(deserialiseLocks('{"not":"an array"}')).toEqual([]);
  });
});
