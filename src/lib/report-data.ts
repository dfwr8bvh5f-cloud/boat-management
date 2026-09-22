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
    topLevelExpenses,
    inProgressPlanIds,
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
      receipt_path: string | null;
      photo_path: string | null;
    }>(
      (rangeFrom, rangeTo) =>
        supabase
          .from("expenses")
          .select("expense_date, description, category, amount, payment_method, receipt_path, photo_path")
          .eq("boat_id", boatId)
          .eq("status", "approved")
          .gte("expense_date", from)
          .lte("expense_date", to)
          // A FINISHED payment plan's payments never show as their own
          // lines here - only the plan's single, already-rolled-up header
          // row does (0072_expense_payment_plans.sql). A still-in-progress
          // plan's payments are fetched separately below and merged in
          // instead, since its header has no expense_date yet to even be
          // matched by the range above - without that, a real payment
          // already reducing the live bank balance (see balances.ts) would
          // never appear in this report at all until the whole plan finishes.
          .is("parent_expense_id", null)
          .is("archived_at", null)
          .order("expense_date")
          .range(rangeFrom, rangeTo)
    ),
    supabase
      .from("expenses")
      .select("id")
      .eq("boat_id", boatId)
      .eq("is_payment_plan", true)
      .is("expense_date", null)
      .is("archived_at", null)
      .then((r) => (r.data ?? []).map((p) => p.id)),
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
    fetchAllRows<{ category: ExpenseCategory | null; amount: number; parent_expense_id: string | null }>((rangeFrom, rangeTo) =>
      supabase
        .from("expenses")
        .select("category, amount, parent_expense_id")
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

  // A still-in-progress plan's own payments (fetched above by parent id,
  // since their header has no expense_date yet to be caught by the range
  // filter) merge in alongside every other top-level expense - each one is
  // a real transaction with its own real date/amount, same as any other row
  // here, just grouped under a plan that hasn't finished yet.
  const inProgressPlanExpenses =
    inProgressPlanIds.length > 0
      ? await fetchAllRows<{
          expense_date: string | null;
          description: string;
          category: ExpenseCategory | null;
          amount: number;
          payment_method: PaymentMethod | null;
          receipt_path: string | null;
          photo_path: string | null;
        }>((rangeFrom, rangeTo) =>
          supabase
            .from("expenses")
            .select("expense_date, description, category, amount, payment_method, receipt_path, photo_path")
            .in("parent_expense_id", inProgressPlanIds)
            .eq("status", "approved")
            .gte("expense_date", from)
            .lte("expense_date", to)
            .is("archived_at", null)
            .order("expense_date")
            .range(rangeFrom, rangeTo)
        )
      : [];
  const expenses = [...topLevelExpenses, ...inProgressPlanExpenses].sort((a, b) =>
    (a.expense_date ?? "").localeCompare(b.expense_date ?? "")
  );
  // ytdExpenses excluded parent_expense_id is-null the same way the main
  // query used to - a finished plan's own payments would double-count
  // against its already-rolled-up header, but an in-progress plan's
  // payments (whose header carries no amount worth counting until it
  // finishes) need to count individually here too, for the same reason as
  // the merge above.
  const ytdExpensesFiltered = (ytdExpenses ?? []).filter(
    (e) => e.parent_expense_id === null || inProgressPlanIds.includes(e.parent_expense_id)
  );

  const totalExpenses = round2(expenses.reduce((s, e) => s + e.amount, 0));
  const totalIncome = round2((incomes ?? []).reduce((s, i) => s + i.amount, 0));
  const cashWithdrawals = round2((cashTx ?? []).reduce((s, c) => s + c.amount, 0));
  const cashUsage = round2(expenses.filter((e) => e.payment_method === "cash").reduce((s, e) => s + e.amount, 0));

  const byCategoryMap = new Map<string, number>();
  for (const e of expenses) {
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
  for (const e of ytdExpensesFiltered) {
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
  for (const e of expenses) {
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
    expenseList: expenses.map((e) => ({
      date: e.expense_date as string,
      description: e.description,
      category: e.category,
      paymentMethod: e.payment_method,
      amount: e.amount,
      receiptPath: e.receipt_path,
      photoPath: e.photo_path,
    })),
    budgetVsActual,
    totalAnnualBudget,
    totalSpentYtd,
    transactionCount: expenses.length,
    monthly,
  };
}
