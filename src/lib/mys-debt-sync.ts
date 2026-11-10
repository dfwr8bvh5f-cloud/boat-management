import "server-only";
import type { createClient } from "@/lib/supabase/server";

// Keeps the originating mys_expenses "boat_payment" row in sync when its
// mirrored debt-side record (a boat's expenses row, or an mys_ad_hoc_charges
// row) is edited directly from /mys/debts instead - the reverse of what
// mirrorBoatPaymentExpense/updateMysExpense already do forward.
// description/date always follow; amount follows onto whichever field
// actually drove this debt's own amount at creation time - client_price if
// a markup was applied, otherwise amount itself (a markup-free debt's
// amount is the raw cost 1:1).
export async function syncMysExpenseFromDebtEdit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  linkColumn: "linked_expense_id" | "linked_ad_hoc_charge_id",
  linkedId: string,
  fields: { description: string; amount: number; date: string | null }
) {
  const { data: mysExpense } = await supabase
    .from("mys_expenses")
    .select("id, markup_percent")
    .eq(linkColumn, linkedId)
    .maybeSingle();
  if (!mysExpense) return;

  const { error } = await supabase
    .from("mys_expenses")
    .update({
      description: fields.description,
      expense_date: fields.date,
      ...(mysExpense.markup_percent != null ? { client_price: fields.amount } : { amount: fields.amount }),
    })
    .eq("id", mysExpense.id);
  if (error) console.error("syncMysExpenseFromDebtEdit: failed to sync mys_expenses row", error);
}
