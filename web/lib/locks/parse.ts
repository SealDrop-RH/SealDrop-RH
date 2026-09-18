import {isAddress} from "viem";
import type {Address} from "./types";

/**
 * Turning what someone typed into something the chain can take.
 *
 * Both directions matter: a decimal string to raw units without ever touching Number, and a
 * raw amount back to a string the field can hold. Going through Number in either direction
 * loses precision on any realistic token supply, and the loss is silent.
 */

export function normaliseAddress(input: string): Address | null {
  const trimmed = input.trim();
  return isAddress(trimmed) ? (trimmed as Address) : null;
}

export type AmountError = "empty" | "not-a-number" | "negative" | "too-many-decimals";

export interface ParsedAmount {
  raw: bigint;
}

/**
 * A decimal string to raw units, in bigint throughout.
 *
 * "1.5" at 18 decimals is 1500000000000000000. Parsing that via parseFloat and multiplying
 * would be wrong by a few wei, which is the kind of error that only shows up as a revert.
 */
export function parseAmount(input: string, decimals: number): ParsedAmount | AmountError {
  const text = input.trim().replace(/,/g, "");
  if (text === "") return "empty";
  if (!/^\d*\.?\d*$/.test(text) || text === ".") return "not-a-number";

  const [whole = "", fraction = ""] = text.split(".");
  if (fraction.length > decimals) return "too-many-decimals";

  const padded = fraction.padEnd(decimals, "0");
  const raw = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
  return {raw};
}

/** Raw units back to a plain decimal string, for putting a MAX into the field. */
export function formatAmountInput(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * Thousands separators on the whole part of a typed amount, leaving the fraction exactly as
 * typed. "1000000.50" becomes "1,000,000.50", not "1,000,000.5": a trailing zero someone is in
 * the middle of typing is not noise to be tidied away.
 */
export function groupDigits(text: string): string {
  const [whole, ...rest] = text.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest.length ? `${grouped}.${rest.join("")}` : grouped;
}

/** Raw units to the grouped string an amount field shows, for presets and Max. */
export function formatAmountGrouped(raw: bigint, decimals: number): string {
  return groupDigits(formatAmountInput(raw, decimals));
}

/**
 * What an amount field should hold after a keystroke, or null to refuse it.
 *
 * Separators are the field's to place, so any the person types or pastes are dropped and put
 * back where they belong. Leading zeros go ("007" is 7) except the one in front of a decimal
 * point. Letters, a second point, or more decimal places than the token has are refused
 * outright rather than half-accepted.
 */
export function cleanAmountText(typed: string, decimals: number): string | null {
  const text = typed.replace(/[,\s]/g, "");
  if (text === "") return "";
  if (!/^\d*\.?\d*$/.test(text)) return null;
  const [whole = "", fraction] = text.split(".");
  if (fraction !== undefined && (decimals === 0 || fraction.length > decimals)) return null;
  const trimmed = whole.replace(/^0+(?=\d)/, "");
  const lead = trimmed === "" && fraction !== undefined ? "0" : trimmed;
  return fraction === undefined ? lead : `${lead}.${fraction}`;
}

/**
 * Where the caret belongs once separators have moved under it.
 *
 * Counted in digits and points, which are the only characters the person actually typed: the
 * caret that sat after the fourth digit before a comma was inserted still sits after the fourth
 * digit afterwards. Without this every keystroke that adds a comma throws the caret to the end.
 */
export function caretAfterGrouping(typed: string, caret: number, grouped: string): number {
  const significant = typed.slice(0, caret).replace(/[^\d.]/g, "").length;
  if (significant === 0) return 0;
  let seen = 0;
  for (let index = 0; index < grouped.length; index += 1) {
    if (/[\d.]/.test(grouped[index])) seen += 1;
    if (seen === significant) return index + 1;
  }
  return grouped.length;
}

export const AMOUNT_MESSAGE: Record<AmountError, string> = {
  empty: "Enter an amount.",
  "not-a-number": "That is not a number.",
  negative: "Enter a positive amount.",
  "too-many-decimals": "That is more decimal places than this token has.",
};

/**
 * The unlock date a form should send, as unix seconds.
 *
 * A datetime-local input gives a string in the browser's own zone, which is what the person
 * picking it means. It is converted here rather than anywhere else so there is one place
 * that can be wrong about it.
 */
export function parseUnlockDate(input: string): number | null {
  if (!input) return null;
  const ms = new Date(input).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** Formats unix seconds for a datetime-local input, in the browser's zone. */
export function toDateTimeLocal(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * The shortest lock the contract will accept, plus slack.
 *
 * A contract requiring `unlockAt >= block.timestamp + MIN` reverts for any mining delay at
 * all if the form sends exactly now + MIN, because block.timestamp has moved on by the time
 * the transaction lands. The slack also absorbs sequencer clock skew, which on this chain
 * can run ahead of real time. It errs towards locking slightly longer, never shorter, and
 * the review panel shows the real total rather than what was typed.
 */
export const MIN_LOCK_SECONDS = 60 * 60;
export const DEADLINE_SLACK_SECONDS = 2 * 60;
