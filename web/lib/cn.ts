/** Joins class names, dropping falsy entries. No merge logic: order wins, as in plain CSS. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
