import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExpenseCategory, FinancialSnapshot } from "@/lib/types/database";
import { computeBankBalance, computeCashBalance } from "@/lib/balances";

function shiftYear(iso: string, delta: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y + delta, m - 1, d));
  return date.toISOString().slice(0, 10);
}

export async function computeFinancialSnapshot(
  supabase: SupabaseClient<Database>,
  boatId: string,
  from: string,
  to: string,
  categories: ExpenseCategory[],
): Promise<FinancialSnapshot> {
  const thisYear = to.slice(0, 4);
  const prevFrom = shiftYear(from, -1);
  const prevTo = shiftYear(to, -1);

  const [
    { data: expenses },
    { data: incomes },
    { data: cashTx },
    { data: prevExpenses },
    { data: flatBudgets },
    { data: subcategories },
    { data: ytdExpenses },
    bankBalance,
    cashBalance,
  ] = await Promise.all([
    supabase
      .from("expenses")
      .select("expense_date, description, category, amount, payment_method")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date"),
    supabase
      .from("incomes")
      .select("amount")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .eq("type", "actual")
      .gte("income_date", from)
      .lte("income_date", to),
    supabase
      .from("cash_transactions")
      .select("type, amount")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .in("type", ["withdrawal", "received"])
      .gte("tx_date", from)
      .lte("tx_date", to),
    supabase
      .from("expenses")
      .select("category, amount")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .gte("expense_date", prevFrom)
      .lte("expense_date", prevTo),
    supabase.from("budget_categories").select("*").eq("boat_id", boatId),
    supabase.from("budget_subcategories").select("*").eq("boat_id", boatId),
    supabase
      .from("expenses")
      .select("category, amount")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .gte("expense_date", `${thisYear}-01-01`)
      .lte("expense_date", `${thisYear}-12-31`),
    computeBankBalance(supabase, boatId, to),
    computeCashBalance(supabase, boatId, to),
  ]);

  const totalExpenses = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const totalIncome = (incomes ?? []).reduce((s, i) => s + i.amount, 0);
  const cashWithdrawals = (cashTx ?? []).reduce((s, c) => s + c.amount, 0);
  const cashUsage = (expenses ?? []).filter((e) => e.payment_method === "cash").reduce((s, e) => s + e.amount, 0);

  const byCategoryMap = new Map<string, number>();
  for (const e of expenses ?? []) {
    byCategoryMap.set(e.category, (byCategoryMap.get(e.category) ?? 0) + e.amount);
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([category, sum]) => ({ category: category as ExpenseCategory, sum }))
    .sort((a, b) => b.sum - a.sum);

  const prevByCategoryMap = new Map<string, number>();
  for (const e of prevExpenses ?? []) {
    prevByCategoryMap.set(e.category, (prevByCategoryMap.get(e.category) ?? 0) + e.amount);
  }
  const previousYearByCategory = [...prevByCategoryMap.entries()].map(([category, sum]) => ({
    category: category as ExpenseCategory,
    sum,
  }));

  const flatByCategory = new Map((flatBudgets ?? []).map((b) => [b.category, b.amount]));
  const subByCategory = new Map<string, { amount: number }[]>();
  for (const sc of subcategories ?? []) {
    const list = subByCategory.get(sc.category) ?? [];
    list.push(sc);
    subByCategory.set(sc.category, list);
  }
  const ytdSpentMap = new Map<string, number>();
  for (const e of ytdExpenses ?? []) {
    ytdSpentMap.set(e.category, (ytdSpentMap.get(e.category) ?? 0) + e.amount);
  }

  const budgetVsActual = categories.map((category) => {
    const subs = subByCategory.get(category);
    const budget = subs && subs.length > 0 ? subs.reduce((s, sc) => s + sc.amount, 0) : flatByCategory.get(category) ?? 0;
    return { category, budget, spentYtd: ytdSpentMap.get(category) ?? 0 };
  });
  const totalAnnualBudget = budgetVsActual.reduce((s, b) => s + b.budget, 0);
  const totalSpentYtd = budgetVsActual.reduce((s, b) => s + b.spentYtd, 0);

  return {
    totalExpenses,
    totalIncome,
    net: totalIncome - totalExpenses,
    cashWithdrawals,
    cashUsage,
    byCategory,
    bankBalance,
    cashBalance,
    expenseList: (expenses ?? []).map((e) => ({
      date: e.expense_date as string,
      description: e.description,
      category: e.category as ExpenseCategory,
      paymentMethod: e.payment_method,
      amount: e.amount,
    })),
    previousYearByCategory,
    budgetVsActual,
    totalAnnualBudget,
    totalSpentYtd,
  };
}
