const compactNumberFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1
});

/**
 * Compact map figures without a currency suffix. A numeric zero remains "0";
 * missing/non-finite data is represented by a dash before it reaches a label.
 */
export function formatCompactValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return compactNumberFormatter
    .format(value)
    .replace(/([kmbt])$/i, (suffix) => suffix.toUpperCase());
}
