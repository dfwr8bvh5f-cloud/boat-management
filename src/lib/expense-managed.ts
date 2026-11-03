// A boat expense that MYS paid and bills back to the client (paid_by =
// 'management' + bill_to_mys) is a DEBT on /mys/debts: payments, invoices and
// bank matches hang off that same row. Editing or deleting it from the boat's
// own Expenses page used to break that bookkeeping silently (e.g. changing the
// payment method or amount while a payment was already recorded against it),
// so such a row is managed only from /mys/debts. Same filter that page uses to
// list its charges (approved, not a payment plan). Pure function so the UI and
// the server actions share one definition.
export function isManagedInMysDebts(e: {
  paid_by: string;
  bill_to_mys: boolean;
  status: string;
  is_payment_plan: boolean;
  parent_expense_id: string | null;
}): boolean {
  return e.paid_by === "management" && e.bill_to_mys === true && e.status === "approved" && !e.is_payment_plan && !e.parent_expense_id;
}
