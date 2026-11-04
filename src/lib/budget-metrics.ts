import { round2 } from "@/lib/money";

// One category's budget vs actual, reduced to what the budget page shows:
// the difference (always a positive magnitude, `kind` says which way) and
// the % used. Pure so the four states can be unit-tested.
//
//  - "none":      no budget and nothing spent - nothing to report
//  - "no_budget": money was spent but the budget is 0 - a % would mislead
//  - "under":     spent less than budgeted -> `diff` is what remains
//  - "on":        spent exactly the budget (to the cent)
//  - "over":      spent more than budgeted -> `diff` is the overage
export type BudgetStatusKind = "none" | "no_budget" | "under" | "on" | "over";

export type BudgetStatus = {
  kind: BudgetStatusKind;
  diff: number;
  // Uncapped, so going over reads e.g. 140%. Null when there is no budget.
  pct: number | null;
  // Raw ratio * 100 (unrounded) - what budgetColor() has always been fed.
  rawPct: number;
};

export function getBudgetStatus(budgeted: number, spent: number): BudgetStatus {
  const budget = round2(budgeted);
  const actual = round2(spent);
  if (budget <= 0) {
    return { kind: actual > 0 ? "no_budget" : "none", diff: 0, pct: null, rawPct: 0 };
  }
  const rawPct = (actual / budget) * 100;
  const pct = Math.round(rawPct);
  const delta = round2(budget - actual);
  if (delta > 0) return { kind: "under", diff: delta, pct, rawPct };
  if (delta < 0) return { kind: "over", diff: -delta, pct, rawPct };
  return { kind: "on", diff: 0, pct, rawPct };
}
