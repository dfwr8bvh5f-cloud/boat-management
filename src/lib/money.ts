// Rounds to the nearest cent. Plain floating-point addition of many small
// currency amounts can drift by fractions of a cent (binary floating point
// can't represent most decimal amounts exactly) - every aggregate sum shown
// as a balance or report total should be rounded through this before
// display/storage.
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// A bare amount with exactly two decimals ("1,284.50") - the one number
// format for money everywhere (screens, reports, documents), so 86 reads
// "86.00" and 1284.5 reads "1,284.50" instead of a mix of "86", "1,284.5"
// and "1,284.50" depending on which screen printed it. Display only: it
// never changes the stored/calculated value.
export function formatAmount(n: number): string {
  return Math.abs(n).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The app's single "€1,234.56" display format. A negative value keeps the
// sign in front of the currency symbol ("-€1,234.56"): prepending "€" to a
// plain negative number produces "€-1,234", which wraps mid-string under
// RTL bidi reordering. Callers that render this inside an RTL page should
// put it in an element with dir="ltr" (see the balance displays) - without
// it the bidi algorithm can still move a leading minus to the visual end.
export function formatCurrency(n: number): string {
  return `${n < 0 && round2(n) !== 0 ? "-" : ""}€${formatAmount(n)}`;
}

// Same output as formatCurrency, kept as its own name because many balance
// call sites already use it for values that can go negative.
export function formatCurrencySigned(n: number): string {
  return formatCurrency(n);
}
