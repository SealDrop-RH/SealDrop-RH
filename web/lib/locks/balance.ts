import type {Address, TokenMeta} from "./types";

/**
 * A stand-in balance for a wallet, while locks are simulated.
 *
 * The fixture tokens do not exist on chain, so a real balanceOf against them fails and the
 * whole app becomes unusable against its own sample data. This derives a plausible balance
 * from the wallet and the token, deterministically, so the number is the same on every
 * screen and across reloads: the lock form, the airdrop allocation and the claim view all
 * have to agree, or the arithmetic on screen contradicts itself.
 *
 * Pure, so the server and the browser produce the same figure. Replaced by a real read in
 * part 2; nothing that consumes it changes.
 */
export function simulatedBalance(holder: Address, token: TokenMeta): bigint {
  // Eight hex characters from the address, mixed with the token so one wallet does not hold
  // the same proportion of everything.
  const seed = BigInt(`0x${holder.slice(2, 10)}`) ^ BigInt(`0x${token.address.slice(2, 10)}`);
  // Between 0.1% and 12% of supply. Wide enough that a minimum-holding threshold actually
  // excludes some wallets rather than being decorative.
  const basisPoints = 10n + (seed % 1190n);
  return (token.totalSupply * basisPoints) / 10_000n;
}
