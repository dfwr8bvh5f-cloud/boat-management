import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashTxType, Database, ExpenseCategory, FinancialSnapshot, PaymentMethod } from "@/lib/types/database";
import { computeBankBalance, computeCashBalance } from "@/lib/balances";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
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
    expenses,
    incomes,
    cashTx,
    { data: flatBudgets },
    { data: subcategories },
    ytdExpenses,
    bankBalance,
    cashBalance,
  ] = await Promise.all([
    // Paginated: a report period covering more than 1000 rows on any of
    // these would otherwise be silently truncated by Supabase's default
    // page cap, understating the report's own totals - the same risk
    // fetchAllRows exists to guard against in balances.ts.
    fetchAllRows<{
      expense_date: string | null;
      description: string;
      category: ExpenseCategory | null;
      amount: number;
      payment_method: PaymentMethod | null;
    }>(
      (rangeFrom, rangeTo) =>
        supabase
          .from("expenses")
          .select("expense_date, description, category, amount, payment_method")
          .eq("boat_id", boatId)
          .eq("status", "approved")
          .gte("expense_date", from)
          .lte("expense_date", to)
          .is("archived_at", null)
          .order("expense_date")
          .range(rangeFrom, rangeTo)
    ),
    fetchAllRows<{ amount: number; income_date: string }>((rangeFrom, rangeTo) =>
      supabase
        .from("incomes")
        .select("amount, income_date")
        .eq("boat_id", boatId)
        .eq("status", "approved")
        .eq("type", "actual")
        .gte("income_date", from)
        .lte("income_date", to)
        .is("archived_at", null)
        .range(rangeFrom, rangeTo)
    ),
    fetchAllRows<{ type: CashTxType; amount: number }>((rangeFrom, rangeTo) =>
      supabase
        .from("cash_transactions")
        .select("type, amount")
        .eq("boat_id", boatId)
        .eq("status", "approved")
        .in("type", ["withdrawal", "received"])
        .gte("tx_date", from)
        .lte("tx_date", to)
        .is("archived_at", null)
        .range(rangeFrom, rangeTo)
    ),
    supabase.from("budget_categories").select("*").eq("boat_id", boatId),
    supabase.from("budget_subcategories").select("*").eq("boat_id", boatId),
    fetchAllRows<{ category: ExpenseCategory | null; amount: number }>((rangeFrom, rangeTo) =>
      supabase
        .from("expenses")
        .select("category, amount")
        .eq("boat_id", boatId)
        .eq("status", "approved")
        .gte("expense_date", `${thisYear}-01-01`)
        .lte("expense_date", `${thisYear}-12-31`)
        .is("archived_at", null)
        .range(rangeFrom, rangeTo)
    ),
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

  const monthlyMap = new Map<string, { income: number; expenses: number }>();
  for (const e of expenses ?? []) {
    const month = (e.expense_date as string).slice(0, 7);
    const entry = monthlyMap.get(month) ?? { income: 0, expenses: 0 };
    entry.expenses += e.amount;
    monthlyMap.set(month, entry);
  }
  for (const i of incomes ?? []) {
    const month = (i.income_date as string).slice(0, 7);
    const entry = monthlyMap.get(month) ?? { income: 0, expenses: 0 };
    entry.income += i.amount;
    monthlyMap.set(month, entry);
  }
  const monthly = [...monthlyMap.entries()]
    .map(([month, v]) => ({ month, income: round2(v.income), expenses: round2(v.expenses) }))
    .sort((a, b) => a.month.localeCompare(b.month));

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
    transactionCount: (expenses ?? []).length,
    monthly,
  };
}
