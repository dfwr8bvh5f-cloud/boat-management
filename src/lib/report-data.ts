import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExpenseCategory, FinancialSnapshot } from "@/lib/types/database";
import { computeBankBalance, computeCashBalance } from "@/lib/balances";
import { round2 } from "@/lib/money";

export async function computeFinancialSnapshot(
  supabase: SupabaseClient<Database>,
  boatId: string,
  from: string,
  to: string,
  categories: ExpenseCategory[],
): Promise<FinancialSnapshot> {
  const thisYear = to.slice(0, 4);

  const [
    { data: expenses },
    { data: incomes },
    { data: cashTx },
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
      .is("archived_at", null)
      .order("expense_date"),
    supabase
      .from("incomes")
      .select("amount")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .eq("type", "actual")
      .gte("income_date", from)
      .lte("income_date", to)
      .is("archived_at", null),
    supabase
      .from("cash_transactions")
      .select("type, amount")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .in("type", ["withdrawal", "received"])
      .gte("tx_date", from)
      .lte("tx_date", to)
      .is("archived_at", null),
    supabase.from("budget_categories").select("*").eq("boat_id", boatId),
    supabase.from("budget_subcategories").select("*").eq("boat_id", boatId),
    supabase
      .from("expenses")
      .select("category, amount")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .gte("expense_date", `${thisYear}-01-01`)
      .lte("expense_date", `${thisYear}-12-31`)
      .is("archived_at", null),
    computeBankBalance(supabase, boatId, to),
    computeCashBalance(supabase, boatId, to),
  ]);

  const totalExpenses = round2((expenses ?? []).reduce((s, e) => s + e.amount, 0));
  const totalIncome = round2((incomes ?? []).reduce((s, i) => s + i.amount, 0));
  const cashWithdrawals = round2((cashTx ?? []).reduce((s, c) => s + c.amount, 0));
  const cashUsage = round2((expenses ?? []).filter((e) => e.payment_method === "cash").reduce((s, e) => s + e.amount, 0));

  const byCategoryMap = new Map<string, number>();
  for (const e of expenses ?? []) {
    if (!e.category) continue;
    byCategoryMap.set(e.category, (byCategoryMap.get(e.category) ?? 0) + e.amount);
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([category, sum]) => ({ category: category as ExpenseCategory, sum: round2(sum) }))
    .sort((a, b) => b.sum - a.sum);

  const flatByCategory = new Map((flatBudgets ?? []).map((b) => [b.category, b.amount]));
  const subByCategory = new Map<string, { amount: number }[]>();
  for (const sc of subcategories ?? []) {
    const list = subByCategory.get(sc.category) ?? [];
    list.push(sc);
    subByCategory.set(sc.category, list);
  }
  const ytdSpentMap = new Map<string, number>();
  for (const e of ytdExpenses ?? []) {
    if (!e.category) continue;
    ytdSpentMap.set(e.category, (ytdSpentMap.get(e.category) ?? 0) + e.amount);
  }

  const budgetVsActual = categories.map((category) => {
    const subs = subByCategory.get(category);
    const budget = round2(subs && subs.length > 0 ? subs.reduce((s, sc) => s + sc.amount, 0) : flatByCategory.get(category) ?? 0);
    return { category, budget, spentYtd: round2(ytdSpentMap.get(category) ?? 0) };
  });
  const totalAnnualBudget = round2(budgetVsActual.reduce((s, b) => s + b.budget, 0));
  const totalSpentYtd = round2(budgetVsActual.reduce((s, b) => s + b.spentYtd, 0));

  return {
    totalExpenses,
    totalIncome,
    net: round2(totalIncome - totalExpenses),
    cashWithdrawals,
    cashUsage,
    byCategory,
    bankBalance,
    cashBalance,
    expenseList: (expenses ?? []).map((e) => ({
      date: e.expense_date as string,
      description: e.description,
      category: e.category,
      paymentMethod: e.payment_method,
      amount: e.amount,
    })),
    budgetVsActual,
    totalAnnualBudget,
    totalSpentYtd,
  };
}
