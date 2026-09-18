import {describe, expect, it} from "vitest";
import {SEAL_ADDRESS, SEAL_TOKEN, SOCIAL, tokenHref} from "@/lib/social";
import {launchpadBase} from "@/lib/pons";

const REAL = "0x1682C0b0f1f26b4a43E107f53E35275eF0cd967B";

describe("the $SEAL ticker link", () => {
  it("links a well-formed address to its launchpad page", () => {
    expect(tokenHref(REAL)).toBe(`${launchpadBase}/${REAL}`);
  });

  // Only meaningful with the override unset: a deployment pointed at a test launchpad is
  // supposed to build somewhere else, and that is not a failure.
  it.skipIf(Boolean(process.env.NEXT_PUBLIC_PONS_LAUNCHPAD_URL))("builds on the Pons launchpad by default", () => {
    expect(launchpadBase).toBe("https://www.ponsfamily.com/launchpad");
  });

  // Each of these would otherwise be a working link to the wrong token, which is the one
  // outcome the ticker must never produce.
  it.each([
    ["empty", ""],
    ["a placeholder", "0x000..."],
    ["one character short", REAL.slice(0, -1)],
    ["one character long", `${REAL}0`],
    ["missing the 0x prefix", REAL.slice(2)],
    ["containing a non-hex character", `${REAL.slice(0, -1)}g`],
    ["surrounded by whitespace", ` ${REAL} `],
  ])("refuses an address that is %s", (_, address) => {
    expect(tokenHref(address)).toBeNull();
  });

  it("links exactly where the configured address says, and nowhere else", () => {
    // Holds whether SEAL_ADDRESS is empty or filled in, so setting the address is a one-line
    // change that leaves this suite green. The empty case meaning SOON, never a live link, is
    // already pinned above by the "refuses an address that is empty" case.
    expect(SEAL_TOKEN.symbol).toBe("SEAL");
    expect(SEAL_TOKEN.href).toBe(tokenHref(SEAL_ADDRESS));
  });
});

describe("the project's accounts", () => {
  it("points at the right GitHub and X", () => {
    expect(SOCIAL.github.href).toBe("https://github.com/SealDrop-RH/SealDrop-RH");
    expect(SOCIAL.x.href).toBe("https://x.com/sealdropfamily");
  });
});
