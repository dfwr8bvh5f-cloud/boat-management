// Every payment recorded on the MYS side (a debt settlement, an invoice
// payment, a commission payment, income linked to a debt) must be complete:
// amount, date and payment method - and, for a boat charge, the expense
// category - so nothing lands in the boat's "pending (incomplete)" list or
// in the reports half-filled. One definition shared by the server actions
// (the real gate) and the forms (so Save can stay disabled until complete).
export type MissingPaymentField = "amount" | "date" | "payment_method" | "category";

export function missingPaymentFields(input: {
  amount: number | string | null | undefined;
  date: string | null | undefined;
  method: string | null | undefined;
  // Pass only when a category is required (a boat charge); omit otherwise.
  category?: string | null;
  categoryRequired?: boolean;
}): MissingPaymentField[] {
  const missing: MissingPaymentField[] = [];
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) missing.push("amount");
  if (!input.date) missing.push("date");
  if (!input.method) missing.push("payment_method");
  if (input.categoryRequired && !input.category) missing.push("category");
  return missing;
}
