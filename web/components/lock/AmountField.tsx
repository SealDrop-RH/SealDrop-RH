"use client";

import {Hint, Label, Mono} from "@/components/ui/primitives";
import {AmountInput, HoldingShares} from "@/components/ui/AmountInput";
import {formatAmountGrouped, parseAmount, AMOUNT_MESSAGE, type AmountError} from "@/lib/locks/parse";
import {formatPercent, lockedShare} from "@/lib/format";
import type {TokenMeta} from "@/lib/locks/types";

/**
 * How much to lock, expressed both ways.
 *
 * The raw figure is what gets signed, but the share of supply is what the decision is
 * actually about, so both are shown at once and the presets are expressed as shares. Nobody
 * decides to lock 19,537,128 tokens; they decide to lock most of what they hold.
 *
 * The field itself will not take more than the wallet holds: see components/ui/AmountInput.
 */
export function AmountField({
  value,
  onChange,
  token,
  balance,
}: {
  value: string;
  onChange: (value: string) => void;
  token: TokenMeta | null;
  /** What the connected wallet holds. Undefined until a wallet is connected. */
  balance?: bigint;
}) {
  const parsed = token ? parseAmount(value, token.decimals) : null;
  const error = typeof parsed === "string" ? (parsed as AmountError) : null;
  const raw = parsed && typeof parsed !== "string" ? parsed.raw : null;

  // Still checked, though the field refuses keystrokes past the balance: a value can arrive
  // before the balance has loaded, and the balance can drop while the form is open.
  const overBalance = raw !== null && balance !== undefined && raw > balance;
  const overSupply = raw !== null && token !== null && raw > token.totalSupply;
  const share = raw !== null && token ? lockedShare(raw, token.totalSupply) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor="amount">Amount</Label>
        {token && balance !== undefined ? (
          <span className="text-[11.5px] text-fg-subtle">
            You hold <Mono className="text-fg-muted">{formatAmountGrouped(balance, token.decimals)}</Mono>{" "}
            {token.symbol}
          </span>
        ) : null}
      </div>

      <AmountInput
        id="amount"
        value={value}
        onChange={onChange}
        decimals={token?.decimals}
        max={balance}
        symbol={token?.symbol}
        shortcuts={
          token && balance !== undefined ? (
            <HoldingShares balance={balance} decimals={token.decimals} current={raw} onPick={onChange} />
          ) : null
        }
        hint={
          !token ? (
            <Hint>Resolve a token first.</Hint>
          ) : error && value.trim() !== "" ? (
            <Hint tone="error">{AMOUNT_MESSAGE[error]}</Hint>
          ) : overSupply ? (
            <Hint tone="error">That is more than the entire supply of this token.</Hint>
          ) : overBalance ? (
            <Hint tone="error">That is more than this wallet holds.</Hint>
          ) : share !== null && share > 0 ? (
            <Hint>
              <Mono>{formatPercent(share)}</Mono> of the total supply of {token.symbol}.
            </Hint>
          ) : (
            <Hint>How much of the supply you want to take out of circulation.</Hint>
          )
        }
      />

    </div>
  );
}
