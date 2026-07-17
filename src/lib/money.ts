// Rounds to the nearest cent. Plain floating-point addition of many small
// currency amounts can drift by fractions of a cent (binary floating point
// can't represent most decimal amounts exactly) - every aggregate sum shown
// as a balance or report total should be rounded through this before
// display/storage.
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// The app's single "€1,234.56" display format everywhere an amount is known
// to never be negative (an expense, a budget line, a chart value).
export function formatCurrency(n: number): string {
  return `€${n.toLocaleString("he-IL")}`;
}

// For values that can go negative (a bank/cash balance) - prepending "€" to
// a plain negative number produces "€-1,234", which wraps mid-string under
// RTL bidi reordering; putting the sign before the currency symbol instead
// keeps it on one line and reads correctly either direction.
export function formatCurrencySigned(n: number): string {
  return `${n < 0 ? "-" : ""}€${Math.abs(n).toLocaleString("he-IL")}`;
}
