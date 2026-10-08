import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PaymentMethod } from "@/lib/types/database";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { addDaysISO } from "@/lib/date-format";
import { round2 } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/labels";

// An owner-trip expense entered a few days before boarding or after
// disembarking (provisioning ahead, a bill settled after the fact) is still
// part of the trip's real cost - widened on both ends of the exact trip
// dates she picks, but only for this report (which only ever shows the
// "owner_trip" category to begin with, so there's no risk of accidentally
// pulling in an unrelated category's spending from the extra days).
const GRACE_DAYS = 4;

export type OwnerTripExpenseRow = {
  date: string;
  description: string;
  subcategory: string | null;
  paymentMethod: PaymentMethod | null;
  amount: number;
  receiptPath: string | null;
  photoPath: string | null;
};

export type OwnerTripReport = {
  from: string;
  to: string;
  queryFrom: string;
  queryTo: string;
  total: number;
  bySubcategory: { subcategory: string | null; sum: number }[];
  byPaymentMethod: { method: PaymentMethod; sum: number }[];
  expenseList: OwnerTripExpenseRow[];
};

// Scoped to just what an owner-trip report needs - total spend, a
// subcategory breakdown, a payment-method breakdown, and the line items -
// deliberately not the full computeFinancialSnapshot (report-data.ts),
// which pulls in income/balances/budget-vs-actual that have nothing to do
// with "what did this one trip cost" and that she explicitly doesn't want
// shown here.
export async function computeOwnerTripReport(
  supabase: SupabaseClient<Database>,
  boatId: string,
  from: string,
  to: string
): Promise<OwnerTripReport> {
  const queryFrom = addDaysISO(from, -GRACE_DAYS);
  const queryTo = addDaysISO(to, GRACE_DAYS);

  const expenses = await fetchAllRows<{
    expense_date: string | null;
    description: string;
    subcategory: string | null;
    amount: number;
    payment_method: PaymentMethod | null;
    receipt_path: string | null;
    photo_path: string | null;
  }>((rangeFrom, rangeTo) =>
    supabase
      .from("expenses")
      .select("expense_date, description, subcategory, amount, payment_method, receipt_path, photo_path")
      .eq("boat_id", boatId)
      .eq("category", "owner_trip")
      .eq("status", "approved")
      .gte("expense_date", queryFrom)
      .lte("expense_date", queryTo)
      .is("parent_expense_id", null)
      .is("archived_at", null)
      .order("expense_date")
      .range(rangeFrom, rangeTo)
  );

  // Same "no payment method set = no money has actually moved yet" rule
  // computeFinancialSnapshot already applies - an unpaid row still shows in
  // the itemized list below, just excluded from the total and both charts,
  // so it's visible without pretending it's already-spent money.
  const paid = expenses.filter((e) => e.payment_method !== null);
  const total = round2(paid.reduce((s, e) => s + e.amount, 0));

  const subMap = new Map<string | null, number>();
  for (const e of paid) {
    subMap.set(e.subcategory, (subMap.get(e.subcategory) ?? 0) + e.amount);
  }
  const bySubcategory = [...subMap.entries()]
    .map(([subcategory, sum]) => ({ subcategory, sum: round2(sum) }))
    .sort((a, b) => b.sum - a.sum);

  const payMap = new Map<PaymentMethod, number>();
  for (const e of paid) {
    payMap.set(e.payment_method as PaymentMethod, (payMap.get(e.payment_method as PaymentMethod) ?? 0) + e.amount);
  }
  const byPaymentMethod = PAYMENT_METHODS.map((method) => ({ method, sum: round2(payMap.get(method) ?? 0) }));

  return {
    from,
    to,
    queryFrom,
    queryTo,
    total,
    bySubcategory,
    byPaymentMethod,
    expenseList: expenses
      .map((e) => ({
        date: e.expense_date as string,
        description: e.description,
        subcategory: e.subcategory,
        paymentMethod: e.payment_method,
        amount: e.amount,
        receiptPath: e.receipt_path,
        photoPath: e.photo_path,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
