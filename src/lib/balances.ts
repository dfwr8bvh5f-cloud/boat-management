import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

// Bank balance = money that moved through the bank: approved deposits, minus
// cash pulled out of the bank (a cash withdrawal), minus approved expenses
// that were paid by bank transfer or card.
export async function computeBankBalance(supabase: SupabaseClient<Database>, boatId: string): Promise<number> {
  const [{ data: incomes }, { data: withdrawals }, { data: expenses }] = await Promise.all([
    supabase.from("incomes").select("amount").eq("boat_id", boatId).eq("status", "approved").eq("type", "actual"),
    supabase
      .from("cash_transactions")
      .select("amount")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .eq("type", "withdrawal"),
    supabase
      .from("expenses")
      .select("amount")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .in("payment_method", ["bank_transfer", "card"]),
  ]);

  const incomeSum = (incomes ?? []).reduce((s, i) => s + i.amount, 0);
  const withdrawalSum = (withdrawals ?? []).reduce((s, w) => s + w.amount, 0);
  const expenseSum = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  return incomeSum - withdrawalSum - expenseSum;
}

// Cash balance = cash withdrawn from the bank or received directly in hand,
// minus approved expenses that were paid in cash.
export async function computeCashBalance(supabase: SupabaseClient<Database>, boatId: string): Promise<number> {
  const [{ data: cashTx }, { data: expenses }] = await Promise.all([
    supabase
      .from("cash_transactions")
      .select("amount")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .in("type", ["withdrawal", "received"]),
    supabase.from("expenses").select("amount").eq("boat_id", boatId).eq("status", "approved").eq("payment_method", "cash"),
  ]);

  const inflow = (cashTx ?? []).reduce((s, c) => s + c.amount, 0);
  const cashExpenseSum = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  return inflow - cashExpenseSum;
}
