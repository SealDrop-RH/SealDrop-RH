"use client";

import {useEffect, useId, useMemo, useRef, useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {CaretDown, CheckCircle, CircleNotch, Wallet} from "@phosphor-icons/react";
import {Hint, Input, Label, Mono} from "@/components/ui/primitives";
import {getAdapter} from "@/lib/locks/adapter";
import {useHeldTokens, type HeldToken} from "@/lib/hooks/useHeldTokens";
import {useTokenBalance} from "@/lib/hooks/useTokenBalance";
import {normaliseAddress} from "@/lib/locks/parse";
import {formatAmount, formatCompact} from "@/lib/format";
import {cn} from "@/lib/cn";
import {activeChain} from "@/lib/chain";
import type {TokenMeta} from "@/lib/locks/types";

/**
 * The contract address, resolved to a token.
 *
 * Resolution is debounced rather than fired per keystroke: a 42-character address typed or
 * pasted would otherwise produce dozens of lookups, all but the last of them for a prefix
 * that cannot be an address anyway.
 *
 * Focusing the field offers what the connected wallet already holds. That list is a shortcut
 * and never a gate: the field stays a plain text input, a pasted address that is not in the
 * list resolves exactly as before, and the picker simply does not appear when there is nothing
 * to suggest. Whatever route an address arrives by, it is resolved against the chain the same
 * way, so picking a row is only a faster way of typing one.
 */
export function TokenField({
  value,
  onChange,
  onResolved,
}: {
  value: string;
  onChange: (value: string) => void;
  onResolved: (token: TokenMeta | null) => void;
}) {
  const [debounced, setDebounced] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 250);
    return () => clearTimeout(timer);
  }, [value]);

  const address = normaliseAddress(debounced);
  const {data: token, isFetching} = useQuery({
    queryKey: ["token", address],
    queryFn: () => getAdapter().getToken(address as `0x${string}`),
    enabled: Boolean(address),
  });

  useEffect(() => {
    onResolved(token ?? null);
  }, [token, onResolved]);

  // Shown next to the supply because the two are easy to confuse, and the one that decides
  // what you can actually put in is this one.
  const held = useTokenBalance(token ?? null);
  const {tokens} = useHeldTokens();

  // Typing filters the list rather than dismissing it, so a half-remembered symbol narrows
  // the same rows that focusing revealed. A fully typed address matches nothing by symbol, so
  // the list empties itself and gets out of the way.
  const matches = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (!needle) return tokens;
    return tokens.filter(
      (candidate) =>
        candidate.symbol.toLowerCase().includes(needle) ||
        candidate.name.toLowerCase().includes(needle) ||
        candidate.address.toLowerCase().includes(needle),
    );
  }, [tokens, value]);

  // Closing on a click outside rather than on blur: blur fires before the click lands on a
  // row, so closing there would dismiss the list a moment before it could be chosen from.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Clamped at render rather than reset from an effect: the list can shrink under the
  // highlight as typing filters it, and an effect that corrected it afterwards would render
  // one frame pointing at a row that is no longer there.
  const activeIndex = matches.length === 0 ? 0 : Math.min(active, matches.length - 1);
  const showList = open && matches.length > 0;

  const choose = (candidate: HeldToken) => {
    onChange(candidate.address);
    setDebounced(candidate.address);
    setOpen(false);
  };

  // Only complain once there is enough typed to be a wrong address rather than a short one.
  const malformed = debounced.trim().length >= 10 && !address;
  const missing = Boolean(address) && !isFetching && token === null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor="token">Token address</Label>
        <span className="text-[11.5px] text-fg-subtle">{activeChain.name}</span>
      </div>

      <div className="relative" ref={wrapper}>
        <Input
          id="token"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") return setOpen(false);
            if (!showList) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((activeIndex + 1) % matches.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((activeIndex - 1 + matches.length) % matches.length);
            } else if (event.key === "Enter") {
              // Only when a row is genuinely highlighted, so Enter on a pasted address still
              // submits the form rather than silently replacing what was typed.
              event.preventDefault();
              choose(matches[activeIndex]);
            }
          }}
          placeholder="0x..."
          spellCheck={false}
          autoComplete="off"
          className="num pr-10"
          aria-invalid={malformed || missing}
          aria-describedby="token-hint"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
        />
        {isFetching ? (
          <CircleNotch
            size={15}
            weight="bold"
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-fg-subtle"
            aria-hidden
          />
        ) : token ? (
          <CheckCircle
            size={16}
            weight="fill"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-positive"
            aria-hidden
          />
        ) : matches.length > 0 ? (
          <CaretDown
            size={13}
            weight="bold"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
        ) : null}

        {showList ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="Tokens this wallet holds"
            className={cn(
              "absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-y-auto",
              "rounded-md bg-surface py-1 shadow-[0_0_0_1px_var(--border-strong),var(--shadow-2,0_8px_24px_rgba(0,0,0,0.45))]",
            )}
          >
            <li className="px-3 pb-1 pt-1.5 text-[10.5px] tracking-wider text-fg-subtle">
              WHAT THIS WALLET HOLDS
            </li>
            {matches.map((candidate, index) => (
              <li key={candidate.address} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  // The input must keep focus, or the list closes before the click completes.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(candidate)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left",
                    "transition-colors duration-[var(--dur-micro)] ease-out",
                    index === activeIndex ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[13px] text-fg">${candidate.symbol}</span>
                    <span className="truncate text-[11.5px] text-fg-subtle">{candidate.name}</span>
                  </span>
                  <Mono className="shrink-0 text-[12.5px] text-fg-muted">
                    {formatAmount(BigInt(candidate.balance), candidate.decimals, 2)}
                  </Mono>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div id="token-hint">
        {malformed ? (
          <Hint tone="error">That is not a valid contract address.</Hint>
        ) : missing ? (
          <Hint tone="error">No token found at that address on {activeChain.name}.</Hint>
        ) : token ? (
          <Hint tone="positive">
            <Mono>${token.symbol}</Mono> · {token.name} · {token.decimals} decimals · total supply{" "}
            <Mono>{formatCompact(token.totalSupply, token.decimals)}</Mono>
            {held !== undefined ? (
              <>
                {" · "}
                <span className="text-fg">
                  you hold <Mono>{formatAmount(held, token.decimals, 2)}</Mono>
                </span>
              </>
            ) : null}
          </Hint>
        ) : matches.length > 0 ? (
          <Hint>
            <span className="inline-flex items-center gap-1.5">
              <Wallet size={12} weight="fill" aria-hidden />
              Pick one of the {matches.length === 1 ? "token" : `${matches.length} tokens`} this
              wallet holds, or paste any contract address.
            </span>
          </Hint>
        ) : (
          <Hint>Paste the contract address of the token whose supply you want to lock.</Hint>
        )}
      </div>
    </div>
  );
}
