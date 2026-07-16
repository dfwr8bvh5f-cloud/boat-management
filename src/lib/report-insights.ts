import type { ExpenseCategory, FinancialSnapshot } from "@/lib/types/database";
import { round2 } from "@/lib/money";

// Every value here is derived deterministically from the already-computed
// snapshot - no AI, no guessing. If a figure can't be computed from real
// data (e.g. there's no "supplier" field on expenses), it's simply not
// included rather than approximated.
export type ReportInsights = {
  largestCategory: { category: ExpenseCategory; sum: number } | null;
  cashBurnMonthly: number;
  budgetRemaining: number;
  highestMonth: { month: string; amount: number } | null;
  avgMonthlyExpenses: number;
  trend: "up" | "down" | "flat" | null;
  overBudgetCategories: { category: ExpenseCategory; budget: number; spentYtd: number; overBy: number }[];
  savingsOpportunities: { category: ExpenseCategory; budget: number; spentYtd: number; remaining: number }[];
};

function monthsInPeriod(from: string, to: string): number {
  const [fy, fm] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

export function computeReportInsights(snapshot: FinancialSnapshot, from: string, to: string): ReportInsights {
  const months = monthsInPeriod(from, to);

  const largestCategory = snapshot.byCategory.length > 0 ? snapshot.byCategory[0] : null;

  const cashBurnMonthly = round2(snapshot.cashUsage / months);
  const budgetRemaining = round2(snapshot.totalAnnualBudget - snapshot.totalSpentYtd);
  const avgMonthlyExpenses = round2(snapshot.totalExpenses / months);

  const highestMonthEntry =
    snapshot.monthly.length > 0
      ? snapshot.monthly.reduce((max, m) => (m.expenses > max.expenses ? m : max), snapshot.monthly[0])
      : null;
  const highestMonth = highestMonthEntry ? { month: highestMonthEntry.month, amount: highestMonthEntry.expenses } : null;

  let trend: ReportInsights["trend"] = null;
  if (snapshot.monthly.length >= 2) {
    const last = snapshot.monthly[snapshot.monthly.length - 1];
    const prev = snapshot.monthly[snapshot.monthly.length - 2];
    if (prev.expenses > 0) {
      const change = (last.expenses - prev.expenses) / prev.expenses;
      trend = change > 0.05 ? "up" : change < -0.05 ? "down" : "flat";
    }
  }

  const overBudgetCategories = snapshot.budgetVsActual
    .filter((b) => b.budget > 0 && b.spentYtd > b.budget)
    .map((b) => ({ ...b, overBy: round2(b.spentYtd - b.budget) }))
    .sort((a, b) => b.overBy - a.overBy);

  const savingsOpportunities = snapshot.budgetVsActual
    .filter((b) => b.budget > 0 && b.spentYtd < b.budget)
    .map((b) => ({ ...b, remaining: round2(b.budget - b.spentYtd) }))
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 3);

  return {
    largestCategory,
    cashBurnMonthly,
    budgetRemaining,
    highestMonth,
    avgMonthlyExpenses,
    trend,
    overBudgetCategories,
    savingsOpportunities,
  };
}
