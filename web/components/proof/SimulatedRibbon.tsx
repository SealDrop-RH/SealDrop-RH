import {Warning} from "@phosphor-icons/react/dist/ssr";

/**
 * Not decoration, and not subtle on purpose.
 *
 * A convincing lock proof carrying a real-looking transaction hash is a ready-made
 * rug-pull instrument. Someone will screenshot this build and post it as evidence they
 * locked supply. So every surface that presents a lock as fact says plainly when it is not
 * one, including the share image itself, and the explorer link is rendered inert rather
 * than pointing at a transaction that does not exist.
 *
 * It disappears on its own the moment the chain adapter is selected, because it is driven
 * by lock.simulated rather than by a flag someone has to remember to turn off.
 */
export function SimulatedRibbon({subject = "lock"}: {subject?: "lock" | "airdrop"} = {}) {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 bg-warn-dim p-3 shadow-[inset_0_0_0_1px_var(--warn-dim)]"
    >
      <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-warn" aria-hidden />
      <p className="text-[12.5px] leading-relaxed text-warn">
        <strong className="font-medium">
          Simulated {subject}.
        </strong>{" "}
        No contract is deployed yet, so no tokens have moved and this transaction does not exist.
        Do not present this as proof of anything. Real {subject === "lock" ? "locks" : "airdrops"}{" "}
        arrive in part 2.
      </p>
    </div>
  );
}
