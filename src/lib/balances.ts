import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/money";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { Database } from "@/lib/types/database";

// Marks a one-off "opening balance carried from a previous period" income/
// cash-transaction row (see supabase/data-imports/*-bank-cash-detail.sql) -
// it must still count toward the computed balance for everyone, but is only
// ever shown as a visible row to management, not captains/owners.
export const OPENING_BALANCE_MARKER = "יתרת פתיחה - הועברה משנה קודמת";

// System-generated names for a MYBA-contract-created document/income row -
// stored with a fixed Hebrew prefix regardless of which locale the person
// who signed off the contract happened to be using, so the documents/future
// income lists detect this marker and translate the label at display time
// instead of always showing it in Hebrew (see documents/page.tsx,
// future/page.tsx and incomes-list.tsx).
export const MYBA_CONTRACT_NAME_PREFIX = "חוזה MYBA - ";
export const MYBA_DEPOSIT_SOURCE_PREFIX = "מקדמה - ";

// Bank balance = money that moved through the bank: approved deposits, minus
// cash pulled out of the bank (a cash withdrawal), minus approved expenses
// that were paid by bank transfer or card. Pass asOf to get the balance as of
// a specific date instead of the running total to date.
export async function computeBankBalance(
  supabase: SupabaseClient<Database>,
  boatId: string,
  asOf?: string,
): Promise<number> {
  // Paginated: a boat with enough transaction history can pass 1000 rows on
  // any of these three, and an unbounded select() silently caps there -
  // this is the balance every other page treats as ground truth, so a
  // truncated fetch here would be a silent, invisible wrong number.
  const [incomes, withdrawals, expenses] = await Promise.all([
    fetchAllRows<{ amount: number }>((from, to) => {
      let q = supabase
        .from("incomes")
        .select("amount")
        .eq("boat_id", boatId)
        .eq("status", "approved")
        .eq("type", "actual")
        .is("archived_at", null);
      if (asOf) q = q.lte("income_date", asOf);
      return q.range(from, to);
    }),
    fetchAllRows<{ amount: number }>((from, to) => {
      let q = supabase
        .from("cash_transactions")
        .select("amount")
        .eq("boat_id", boatId)
        .eq("status", "approved")
        .eq("type", "withdrawal")
        .is("archived_at", null);
      if (asOf) q = q.lte("tx_date", asOf);
      return q.range(from, to);
    }),
    fetchAllRows<{ amount: number }>((from, to) => {
      let q = supabase
        .from("expenses")
        .select("amount")
        .eq("boat_id", boatId)
        .eq("status", "approved")
        .in("payment_method", ["bank_transfer", "card"])
        .is("archived_at", null);
      if (asOf) q = q.lte("expense_date", asOf);
      return q.range(from, to);
    }),
  ]);

  const incomeSum = incomes.reduce((s, i) => s + i.amount, 0);
  const withdrawalSum = withdrawals.reduce((s, w) => s + w.amount, 0);
  const expenseSum = expenses.reduce((s, e) => s + e.amount, 0);
  return round2(incomeSum - withdrawalSum - expenseSum);
}

// Cash balance = cash withdrawn from the bank or received directly in hand,
// minus approved expenses that were paid in cash. Pass asOf to get the
// balance as of a specific date instead of the running total to date.
export async function computeCashBalance(
  supabase: SupabaseClient<Database>,
  boatId: string,
  asOf?: string,
): Promise<number> {
  const [cashTx, expenses] = await Promise.all([
    fetchAllRows<{ amount: number }>((from, to) => {
      let q = supabase
        .from("cash_transactions")
        .select("amount")
        .eq("boat_id", boatId)
        .eq("status", "approved")
        .in("type", ["withdrawal", "received"])
        .is("archived_at", null);
      if (asOf) q = q.lte("tx_date", asOf);
      return q.range(from, to);
    }),
    fetchAllRows<{ amount: number }>((from, to) => {
      let q = supabase
        .from("expenses")
        .select("amount")
        .eq("boat_id", boatId)
        .eq("status", "approved")
        .eq("payment_method", "cash")
        .is("archived_at", null);
      if (asOf) q = q.lte("expense_date", asOf);
      return q.range(from, to);
    }),
  ]);

  const inflow = cashTx.reduce((s, c) => s + c.amount, 0);
  const cashExpenseSum = expenses.reduce((s, e) => s + e.amount, 0);
  return round2(inflow - cashExpenseSum);
}
