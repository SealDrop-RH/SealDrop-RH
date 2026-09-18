"use client";

import {useCallback, useState} from "react";
import {useRouter} from "next/navigation";
import {useAccount} from "wagmi";
import {useClock} from "@/components/Clock";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {TokenField} from "./TokenField";
import {AmountField} from "./AmountField";
import {UnlockDateField} from "./UnlockDateField";
import {LockSummary} from "./LockSummary";
import {useLockTx} from "@/lib/hooks/useLockTx";
import {useTokenBalance} from "@/lib/hooks/useTokenBalance";
import {isSimulated} from "@/lib/locks/adapter";
import {
  DEADLINE_SLACK_SECONDS,
  MIN_LOCK_SECONDS,
  parseAmount,
  parseUnlockDate,
} from "@/lib/locks/parse";
import type {TokenMeta} from "@/lib/locks/types";

/**
 * The lock form.
 *
 * Validation is computed from the parsed values on every render rather than held in state,
 * so what the submit button is enabled by and what the review panel shows are the same
 * thing by construction. A separate `isValid` flag is how a form ends up letting you sign
 * something it is also telling you is wrong.
 */
export function LockForm() {
  const router = useRouter();
  const {address, isConnected} = useAccount();
  const {state, busy, lock, reset, cancel} = useLockTx();

  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState<TokenMeta | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [unlockInput, setUnlockInput] = useState("");

  const balance = useTokenBalance(token);

  // From the shared clock rather than a Date.now() read during render, which is neither pure
  // nor safe to do while the server is rendering the same tree. It ticks once a second,
  // which costs one render of a static form and buys live validation: a date that was far
  // enough out when the page loaded stops being valid on its own, rather than at submit.
  const now = Math.floor(useClock() / 1000);

  const parsedAmount = token ? parseAmount(amountInput, token.decimals) : null;
  const amount = parsedAmount && typeof parsedAmount !== "string" ? parsedAmount.raw : null;
  const unlockAt = parseUnlockDate(unlockInput);

  const problem =
    !token
      ? "Resolve a token first."
      : amount === null || amount === 0n
        ? "Enter an amount to lock."
        : amount > token.totalSupply
          ? "That is more than the entire supply."
          : balance !== undefined && amount > balance
            ? "That is more than this wallet holds."
            : unlockAt === null
              ? "Pick an unlock date."
              : unlockAt < now + MIN_LOCK_SECONDS
                ? "The unlock date is too soon."
                : null;

  const ready = problem === null && token !== null && amount !== null && unlockAt !== null;

  const submit = useCallback(async () => {
    if (!ready || !address || !token || amount === null || unlockAt === null) return;
    try {
      const created = await lock({
        token: token.address,
        amount,
        // Slack added so a contract requiring `unlockAt >= block.timestamp + MIN` does not
        // revert on mining delay alone. It errs towards locking slightly longer, never
        // shorter, and the review panel above shows the real total.
        unlockAt: unlockAt + DEADLINE_SLACK_SECONDS,
        owner: address,
      });
      router.push(`/lock/success?id=${created.id}`);
    } catch {
      // useLockTx has already put the message into state and raised a toast. Rethrowing
      // here would only produce an unhandled rejection.
    }
  }, [ready, address, token, amount, unlockAt, lock, router]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_368px] lg:gap-8">
      <div className="flex min-w-0 flex-col gap-5">
        <TokenField value={tokenInput} onChange={setTokenInput} onResolved={setToken} />
        <AmountField value={amountInput} onChange={setAmountInput} token={token} balance={balance} />
        <UnlockDateField value={unlockInput} onChange={setUnlockInput} now={now} />
      </div>

      {/* Sticky, so what is about to be signed stays on screen while the form above it is
          being filled in. top-20 clears the app topbar. */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <ConnectButton.Custom>
          {({openConnectModal}) => (
            <LockSummary
              token={token}
              amount={amount}
              unlockAt={unlockAt}
              now={now}
              simulated={isSimulated()}
              status={state.status}
              error={state.error}
              busy={busy}
              ready={ready}
              problem={problem}
              connected={isConnected}
              onConnect={openConnectModal ?? (() => {})}
              onSubmit={() => {
                if (state.status === "error") reset();
                void submit();
              }}
              onRetry={submit}
              onCancel={cancel}
            />
          )}
        </ConnectButton.Custom>
      </div>
    </div>
  );
}
