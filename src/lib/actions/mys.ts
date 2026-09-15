"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { deleteExpense } from "@/lib/actions/expenses";
import { markMysSupplierCommissionPaid } from "@/lib/actions/mys-commissions";
import { emptyToNull, emptyToUndefined } from "@/lib/form-utils";
import { todayLocalISO } from "@/lib/date-format";
import { round2 } from "@/lib/money";
import { MYS_SUBCATEGORIES_BY_CATEGORY } from "@/lib/labels";
import type { MysExpenseCategory, MysIncome, PaymentMethod, RecurrenceFrequency } from "@/lib/types/database";

// Every page in this module is management-only (see each page's own
// `requireProfile` + role check), and every action here re-asserts that
// itself via requireManagement rather than trusting the page gate alone -
// same defense-in-depth every other server action in this app already has.
function revalidateAll() {
  revalidatePath("/mys");
  revalidatePath("/mys/expenses");
  revalidatePath("/mys/income");
}

function revalidateDebts() {
  revalidatePath("/mys");
  revalidatePath("/mys/debts");
}

// Signed upload URL for a MYS expense's own receipt - same direct-to-
// storage pattern as createExpenseUploadUrl (src/lib/actions/expenses.ts),
// just under a "mys/" prefix in the same shared "receipts" bucket instead
// of a boat_id one (see 0073_mys_module.sql for why no new bucket/policy
// was needed).
export async function createMysExpenseUploadUrl(fileName: string) {
  await requireManagement();
  const supabase = await createClient();
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const storagePath = `mys/${Date.now()}_${safeName}`;
  const { data, error } = await supabase.storage.from("receipts").createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);
  return { path: storagePath, token: data.token };
}

// Shared by createMysExpense and updateMysExpense: category/subcategory,
// plus the "boat_payment" category's own fields. client_price is always
// derived here from amount * (1 + markup_percent/100), never trusted from
// the client directly - the browser only sends amount and markup_percent,
// see mys-expenses-manager.tsx's live-preview computation for why it can
// still show the same number instantly without waiting on this.
export async function readMysExpenseFields(formData: FormData) {
  // Nullable ("not decided yet") - same reasoning as the boat side's own
  // category/expense_date. See 0088_mys_expense_category_date_optional.sql.
  const category = emptyToNull(formData.get("category")) as MysExpenseCategory | null;
  const amount = Number(formData.get("amount") ?? 0);
  const isBoatPayment = category === "boat_payment";
  const markupPercent = isBoatPayment ? Number(formData.get("markup_percent") ?? 0) || null : null;

  return {
    category,
    subcategory: category && MYS_SUBCATEGORIES_BY_CATEGORY[category] ? emptyToNull(formData.get("subcategory")) : null,
    description: String(formData.get("description") ?? "").trim(),
    amount,
    expense_date: emptyToNull(formData.get("expense_date")),
    payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
    client_name: isBoatPayment ? emptyToNull(formData.get("client_name")) : null,
    markup_percent: markupPercent,
    client_price: isBoatPayment && markupPercent != null ? round2(amount * (1 + markupPercent / 100)) : null,
    invoice_number: emptyToNull(formData.get("invoice_number")),
    notes: emptyToNull(formData.get("notes")),
  };
}

// A "boat_payment" expense's client_name is checked against the fleet's
// real boats, same match-or-fallback lookup createMysAdHocCharge already
// uses:
//  - a match mirrors a row onto that boat's own ledger - what the boat
//    actually owes back, at the marked-up figure, with no payment_method
//    (never paid from the boat's own bank/cash) and its receipt withheld
//    the moment a markup is applied (it would reveal the real cost).
//  - no match (a genuinely outside client) mirrors a mys_ad_hoc_charges row
//    instead, so it still shows up as an open debt on /mys/debts even
//    though there's no real boat to attach an expense to.
// Both branches are best-effort: a failure here is logged, not thrown -
// the mys_expenses row (the primary intent) is already saved.
export async function mirrorBoatPaymentExpense(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  mysExpenseId: string,
  fields: Awaited<ReturnType<typeof readMysExpenseFields>>,
  receiptPath: string | null
) {
  if (fields.category !== "boat_payment" || !fields.client_name) return;

  const { data: matchedBoat } = await supabase.from("boats").select("id").eq("name", fields.client_name).maybeSingle();

  if (matchedBoat) {
    const now = new Date().toISOString();
    const { data: boatExpense, error: boatExpenseError } = await supabase
      .from("expenses")
      .insert({
        boat_id: matchedBoat.id,
        description: fields.description,
        amount: fields.client_price ?? fields.amount,
        // Left unset ("not decided yet") rather than guessed as "management" -
        // she picks the real category herself on the boat's own expense list,
        // same nullable-category treatment expenses already support
        // (0058_expense_category_optional.sql). The MYS logo badge on that
        // row (expenses-manager.tsx, driven by paid_by='management' below)
        // is what marks it as hers to categorize.
        category: null,
        paid_by: "management",
        // A genuine MYS-initiated client charge, not a routine boat cost -
        // always a real debt owed back, unlike most paid_by='management'
        // rows entered directly on the boat's own expense form. See
        // Expense.bill_to_mys / 0099_expense_bill_to_mys.sql.
        bill_to_mys: true,
        expense_date: fields.expense_date,
        payment_method: null,
        status: "approved",
        created_by: profileId,
        approved_by: profileId,
        approved_at: now,
        receipt_path: fields.markup_percent ? null : receiptPath,
      })
      .select("id")
      .single();

    if (boatExpenseError || !boatExpense) {
      console.error("mirrorBoatPaymentExpense: failed to insert mirrored boat expense", boatExpenseError);
      return;
    }

    const { error: linkError } = await supabase.from("mys_expenses").update({ linked_expense_id: boatExpense.id }).eq("id", mysExpenseId);
    if (linkError) console.error("mirrorBoatPaymentExpense: failed to link mys_expenses row to mirrored boat expense", linkError);

    revalidatePath(`/boats/${matchedBoat.id}/finance/expenses`);
    revalidatePath(`/boats/${matchedBoat.id}`);
    revalidateDebts();
    return;
  }

  const { data: adHocCharge, error: adHocError } = await supabase
    .from("mys_ad_hoc_charges")
    .insert({
      client_name: fields.client_name,
      description: fields.description,
      amount: fields.client_price ?? fields.amount,
      charge_date: fields.expense_date ?? undefined,
      created_by: profileId,
    })
    .select("id")
    .single();

  if (adHocError || !adHocCharge) {
    console.error("mirrorBoatPaymentExpense: failed to insert ad-hoc debt charge", adHocError);
    return;
  }

  const { error: linkError } = await supabase
    .from("mys_expenses")
    .update({ linked_ad_hoc_charge_id: adHocCharge.id })
    .eq("id", mysExpenseId);
  if (linkError) console.error("mirrorBoatPaymentExpense: failed to link mys_expenses row to ad-hoc debt charge", linkError);

  revalidateDebts();
}

// Shared by createMysExpense: if the recurring-expense checkbox is set,
// creates a new monthly template from this occurrence's own shared fields
// and links the expense back to it (recurring_template_id) - mirrors
// maybeCreateRecurringTemplate (src/lib/actions/expenses.ts) for the boat
// side, just scoped to mys_expenses/mys_expense_recurring_templates
// instead. Best-effort: a failure here doesn't roll back the expense
// itself, which has already been saved successfully by the caller.
async function maybeCreateMysRecurringTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  expenseId: string,
  formData: FormData,
  fields: Awaited<ReturnType<typeof readMysExpenseFields>>,
  createdBy: string | null
) {
  if (formData.get("is_recurring") !== "on") return;
  const nextDueDate = emptyToNull(formData.get("recurring_next_date"));
  if (!nextDueDate) return;
  const dayOfMonth = Number(nextDueDate.split("-")[2]);
  const frequency = (String(formData.get("recurring_frequency") ?? "monthly") as RecurrenceFrequency) || "monthly";
  const endDate = emptyToNull(formData.get("recurring_end_date"));

  const { data: template, error: templateError } = await supabase
    .from("mys_expense_recurring_templates")
    .insert({
      category: fields.category,
      subcategory: fields.subcategory,
      description: fields.description,
      invoice_number: fields.invoice_number,
      amount: fields.amount,
      payment_method: fields.payment_method,
      client_name: fields.client_name,
      markup_percent: fields.markup_percent,
      notes: fields.notes,
      frequency,
      day_of_month: dayOfMonth,
      next_due_date: nextDueDate,
      end_date: endDate,
      active: true,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (templateError) {
    console.error("mys recurring expense template creation failed:", templateError);
    return;
  }

  const { error: linkError } = await supabase.from("mys_expenses").update({ recurring_template_id: template.id }).eq("id", expenseId);
  if (linkError) console.error("mys recurring expense template link failed:", linkError);
}

export async function createMysExpense(formData: FormData) {
  const profile = await requireManagement();
  const supabase = await createClient();

  const fields = await readMysExpenseFields(formData);
  const receiptPath = emptyToNull(formData.get("receipt_path"));
  const { data: inserted, error } = await supabase
    .from("mys_expenses")
    .insert({ ...fields, receipt_path: receiptPath })
    .select("id")
    .single();

  if (error || !inserted) {
    if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]);
    throw new Error(error?.message ?? "Failed to create expense");
  }

  await mirrorBoatPaymentExpense(supabase, profile.id, inserted.id, fields, receiptPath);

  // Marking this expense as recurring schedules a monthly suggestion (see
  // src/lib/actions/mys-recurring-expenses.ts) rather than auto-repeating
  // it - this occurrence, being entered right now, is a real expense either
  // way.
  await maybeCreateMysRecurringTemplate(supabase, inserted.id, formData, fields, profile.id);

  revalidateAll();
}

export async function updateMysExpense(expenseId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("mys_expenses")
    .select("receipt_path, linked_expense_id, linked_ad_hoc_charge_id")
    .eq("id", expenseId)
    .single();
  const fields = await readMysExpenseFields(formData);
  const receiptPath = emptyToNull(formData.get("receipt_path"));

  const { error } = await supabase
    .from("mys_expenses")
    .update({
      ...fields,
      ...(receiptPath ? { receipt_path: receiptPath } : {}),
    })
    .eq("id", expenseId);

  if (error) throw new Error(error.message);

  if (receiptPath && existing?.receipt_path && existing.receipt_path !== receiptPath) {
    await supabase.storage.from("receipts").remove([existing.receipt_path]);
  }

  // The boat/client itself is locked at creation time (see
  // mirrorBoatPaymentExpense) - editing here only syncs the mutable fields
  // onto an already-linked mirrored row, it never creates a new link or
  // moves an existing one to a different boat.
  if (existing?.linked_expense_id) {
    const currentReceiptPath = receiptPath ?? existing.receipt_path;
    const { error: syncError } = await supabase
      .from("expenses")
      .update({
        description: fields.description,
        amount: fields.client_price ?? fields.amount,
        expense_date: fields.expense_date,
        receipt_path: fields.markup_percent ? null : currentReceiptPath,
      })
      .eq("id", existing.linked_expense_id);
    if (syncError) console.error("updateMysExpense: failed to sync mirrored boat expense", syncError);
    revalidateDebts();
  }

  if (existing?.linked_ad_hoc_charge_id) {
    const { error: syncError } = await supabase
      .from("mys_ad_hoc_charges")
      .update({
        description: fields.description,
        amount: fields.client_price ?? fields.amount,
        charge_date: fields.expense_date ?? undefined,
      })
      .eq("id", existing.linked_ad_hoc_charge_id);
    if (syncError) console.error("updateMysExpense: failed to sync linked ad-hoc debt charge", syncError);
    revalidateDebts();
  }

  revalidateAll();
}

// Returns { error } for a refusal she needs to see and act on (an expected
// outcome, not a bug) rather than throwing it - this app's Next.js build
// redacts a thrown Server Action error's message before it reaches the
// client in production (only the generic "Server Components render" text
// survives), so a throw here would silently hide exactly the guidance she
// needs. A genuine unexpected failure (a real DB error) still throws below,
// since that case is a bug worth surfacing as a hard crash + server log.
export async function deleteMysExpense(expenseId: string, receiptPath: string | null): Promise<{ error: string } | undefined> {
  await requireManagement();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("mys_expenses")
    .select("linked_expense_id, linked_ad_hoc_charge_id")
    .eq("id", expenseId)
    .single();

  let linkedBoatId: string | null = null;
  if (existing?.linked_expense_id) {
    const { data: linkedExpense } = await supabase
      .from("expenses")
      .select("id, boat_id, mys_invoice_id, bank_statement_line_id")
      .eq("id", existing.linked_expense_id)
      .single();
    if (linkedExpense) {
      if (linkedExpense.mys_invoice_id) {
        return { error: "This charge has already been invoiced on the boat's side - void that invoice before deleting it here" };
      }
      if (linkedExpense.bank_statement_line_id) {
        return { error: "This charge is already matched to a bank statement line on the boat's side - unlink it there before deleting it here" };
      }
      const { error: deleteLinkedError } = await supabase.from("expenses").delete().eq("id", linkedExpense.id);
      if (deleteLinkedError) throw new Error(deleteLinkedError.message);
      linkedBoatId = linkedExpense.boat_id;
    }
  }

  let hadLinkedAdHocCharge = false;
  if (existing?.linked_ad_hoc_charge_id) {
    const { data: linkedCharge } = await supabase
      .from("mys_ad_hoc_charges")
      .select("id, status, invoice_id")
      .eq("id", existing.linked_ad_hoc_charge_id)
      .single();
    if (linkedCharge) {
      if (linkedCharge.invoice_id) {
        return { error: "This charge has already been invoiced - void that invoice before deleting it here" };
      }
      if (linkedCharge.status === "paid") {
        return { error: "This charge has already been marked paid - it can't be deleted here anymore" };
      }
      const { error: deleteChargeError } = await supabase.from("mys_ad_hoc_charges").delete().eq("id", linkedCharge.id);
      if (deleteChargeError) throw new Error(deleteChargeError.message);
      hadLinkedAdHocCharge = true;
    }
  }

  const { error } = await supabase.from("mys_expenses").delete().eq("id", expenseId);
  if (error) throw new Error(error.message);

  if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]);

  if (linkedBoatId) {
    revalidatePath(`/boats/${linkedBoatId}/finance/expenses`);
    revalidatePath(`/boats/${linkedBoatId}`);
    revalidateDebts();
  }
  if (hadLinkedAdHocCharge) revalidateDebts();

  revalidateAll();
}

// Signed upload URL for a MYS income's own invoice document - same
// direct-to-storage pattern as createMysExpenseUploadUrl above, under the
// same "mys/" prefix in the shared "receipts" bucket.
export async function createMysIncomeUploadUrl(fileName: string) {
  await requireManagement();
  const supabase = await createClient();
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const storagePath = `mys/${Date.now()}_${safeName}`;
  const { data, error } = await supabase.storage.from("receipts").createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);
  return { path: storagePath, token: data.token };
}

export async function createMysIncome(formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const invoicePath = emptyToNull(formData.get("invoice_path"));
  const { error } = await supabase.from("mys_income").insert({
    description: String(formData.get("description") ?? "").trim(),
    category: emptyToNull(formData.get("category")),
    amount: Number(formData.get("amount") ?? 0),
    income_date: emptyToUndefined(formData.get("income_date")),
    client_name: emptyToNull(formData.get("client_name")),
    payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
    invoice_path: invoicePath,
    invoice_issued: invoicePath != null,
    notes: emptyToNull(formData.get("notes")),
  });

  if (error) {
    if (invoicePath) await supabase.storage.from("receipts").remove([invoicePath]);
    throw new Error(error.message);
  }
  revalidateAll();
}

// A lean, read-only snapshot of every currently-open /mys/debts row (all 4
// kinds), just enough to offer as a match/link target while typing a new
// income entry (see linkMysIncomeToDebt below) - not the richer shape the
// debts page itself renders (no attachments/settlement history needed here).
export type MysOpenDebtForMatch = {
  kind: "charge" | "ad_hoc" | "invoice" | "commission";
  id: string;
  boatId: string | null;
  label: string;
  clientName: string | null;
  amount: number;
};

export async function getOpenMysDebtsForIncomeMatch(): Promise<MysOpenDebtForMatch[]> {
  await requireManagement();
  const supabase = await createClient();

  const [{ data: charges }, { data: adHocCharges }, { data: invoices }, { data: commissions }, { data: boats }] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, boat_id, description, amount")
      .eq("paid_by", "management")
      .eq("bill_to_mys", true)
      .eq("is_payment_plan", false)
      .eq("status", "approved")
      .is("mys_invoice_id", null),
    supabase.from("mys_ad_hoc_charges").select("id, client_name, description, amount").eq("status", "unpaid").is("invoice_id", null),
    supabase.from("mys_invoices").select("id, boat_id, client_name, description, amount, vat_amount").in("status", ["draft", "sent"]),
    supabase.from("mys_supplier_commissions").select("id, supplier_name, total_amount").eq("status", "unpaid"),
    supabase.from("boats").select("id, name"),
  ]);

  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));

  const chargeIds = (charges ?? []).map((c) => c.id);
  const adHocIds = (adHocCharges ?? []).map((c) => c.id);
  const invoiceIds = (invoices ?? []).map((i) => i.id);

  const [{ data: chargeSettlements }, { data: adHocSettlements }, { data: invoicePayments }] = await Promise.all([
    chargeIds.length > 0
      ? supabase.from("mys_debt_settlements").select("expense_id, amount").in("expense_id", chargeIds)
      : Promise.resolve({ data: [] as { expense_id: string | null; amount: number }[] }),
    adHocIds.length > 0
      ? supabase.from("mys_debt_settlements").select("ad_hoc_charge_id, amount").in("ad_hoc_charge_id", adHocIds)
      : Promise.resolve({ data: [] as { ad_hoc_charge_id: string | null; amount: number }[] }),
    invoiceIds.length > 0
      ? supabase.from("mys_invoice_payments").select("invoice_id, amount").in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [] as { invoice_id: string; amount: number }[] }),
  ]);

  const paidByChargeId = new Map<string, number>();
  for (const s of chargeSettlements ?? []) if (s.expense_id) paidByChargeId.set(s.expense_id, (paidByChargeId.get(s.expense_id) ?? 0) + s.amount);
  const paidByAdHocId = new Map<string, number>();
  for (const s of adHocSettlements ?? [])
    if (s.ad_hoc_charge_id) paidByAdHocId.set(s.ad_hoc_charge_id, (paidByAdHocId.get(s.ad_hoc_charge_id) ?? 0) + s.amount);
  const paidByInvoiceId = new Map<string, number>();
  for (const p of invoicePayments ?? []) paidByInvoiceId.set(p.invoice_id, (paidByInvoiceId.get(p.invoice_id) ?? 0) + p.amount);

  const rows: MysOpenDebtForMatch[] = [];
  for (const c of charges ?? []) {
    const amount = round2(c.amount - (paidByChargeId.get(c.id) ?? 0));
    if (amount > 0) rows.push({ kind: "charge", id: c.id, boatId: c.boat_id, label: c.description, clientName: boatNameById.get(c.boat_id) ?? null, amount });
  }
  for (const c of adHocCharges ?? []) {
    const amount = round2(c.amount - (paidByAdHocId.get(c.id) ?? 0));
    if (amount > 0) rows.push({ kind: "ad_hoc", id: c.id, boatId: null, label: c.description, clientName: c.client_name, amount });
  }
  for (const i of invoices ?? []) {
    const amount = round2(i.amount + i.vat_amount - (paidByInvoiceId.get(i.id) ?? 0));
    if (amount > 0)
      rows.push({ kind: "invoice", id: i.id, boatId: i.boat_id, label: i.description, clientName: i.client_name ?? boatNameById.get(i.boat_id ?? "") ?? null, amount });
  }
  for (const c of commissions ?? []) {
    if (c.total_amount > 0) rows.push({ kind: "commission", id: c.id, boatId: null, label: c.supplier_name, clientName: c.supplier_name, amount: round2(c.total_amount) });
  }

  return rows.sort((a, b) => a.amount - b.amount);
}

// Creates a mys_income row AND, in the same action, records it as the
// (possibly partial) payment that settles the matched open debt - she picks
// the debt either from a confident automatic amount match or by hand from
// getOpenMysDebtsForIncomeMatch's full list (see mys-income-manager.tsx).
// The settlement side is the half of this action that actually matters, so
// a failure there rolls the just-inserted income row back rather than
// leaving an income entry with no matching debt movement behind it.
export async function linkMysIncomeToDebt(
  formData: FormData,
  debtKind: "charge" | "ad_hoc" | "invoice" | "commission",
  debtId: string,
  boatId: string | null
): Promise<{ error: string } | undefined> {
  await requireManagement();
  const supabase = await createClient();

  const amount = Number(formData.get("amount") ?? 0);
  // Returned, not thrown - see deleteMysExpense's comment on why.
  if (amount <= 0) return { error: "Amount must be greater than zero" };

  const invoicePath = emptyToNull(formData.get("invoice_path"));
  const linkFields: Pick<MysIncome, "linked_expense_id" | "linked_ad_hoc_charge_id" | "mys_invoice_id" | "linked_commission_id"> = {
    linked_expense_id: debtKind === "charge" ? debtId : null,
    linked_ad_hoc_charge_id: debtKind === "ad_hoc" ? debtId : null,
    mys_invoice_id: debtKind === "invoice" ? debtId : null,
    linked_commission_id: debtKind === "commission" ? debtId : null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("mys_income")
    .insert({
      description: String(formData.get("description") ?? "").trim(),
      category: emptyToNull(formData.get("category")),
      amount,
      income_date: emptyToUndefined(formData.get("income_date")),
      client_name: emptyToNull(formData.get("client_name")),
      payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
      invoice_path: invoicePath,
      invoice_issued: invoicePath != null,
      notes: emptyToNull(formData.get("notes")),
      ...linkFields,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    if (invoicePath) await supabase.storage.from("receipts").remove([invoicePath]);
    throw new Error(insertError?.message ?? "Failed to create income");
  }

  const settleFormData = new FormData();
  settleFormData.set("amount", String(amount));
  settleFormData.set("paid_date", String(formData.get("income_date") ?? todayLocalISO()));
  const paymentMethod = formData.get("payment_method");
  if (paymentMethod) settleFormData.set("payment_method", String(paymentMethod));
  settleFormData.set("notes", String(formData.get("notes") ?? ""));

  try {
    // Passing inserted.id through as linkedIncomeId tells the settle step
    // "the income row for this payment already exists, don't create
    // another one" - this action already inserted it above, so without
    // this the settle step's own auto-income-on-payment logic (see
    // createLinkedIncomeForSettlement / addMysInvoicePayment) would create
    // a second, duplicate income row for the same money.
    if (debtKind === "charge" || debtKind === "ad_hoc") {
      const result = await addMysDebtSettlement(debtKind, debtId, boatId, settleFormData, inserted.id);
      if (result?.error) throw new Error(result.error);
    } else if (debtKind === "invoice") {
      const result = await addMysInvoicePayment(debtId, settleFormData, inserted.id);
      if (result?.error) throw new Error(result.error);
    } else {
      await markMysSupplierCommissionPaid(debtId);
    }
  } catch (e) {
    await supabase.from("mys_income").delete().eq("id", inserted.id);
    if (invoicePath) await supabase.storage.from("receipts").remove([invoicePath]);
    throw e instanceof Error ? e : new Error(String(e));
  }

  revalidateAll();
  revalidateDebts();
}

export async function updateMysIncome(incomeId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("mys_income").select("invoice_path").eq("id", incomeId).single();
  const invoicePath = emptyToNull(formData.get("invoice_path"));

  const { error } = await supabase
    .from("mys_income")
    .update({
      description: String(formData.get("description") ?? "").trim(),
      category: emptyToNull(formData.get("category")),
      amount: Number(formData.get("amount") ?? 0),
      income_date: emptyToUndefined(formData.get("income_date")),
      client_name: emptyToNull(formData.get("client_name")),
      payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
      invoice_path: invoicePath,
      invoice_issued: invoicePath != null,
      notes: emptyToNull(formData.get("notes")),
    })
    .eq("id", incomeId);

  if (error) throw new Error(error.message);

  // Covers both a replaced file and a plain removal (invoicePath null) -
  // either way the old object in storage is now orphaned.
  if (existing?.invoice_path && existing.invoice_path !== invoicePath) {
    await supabase.storage.from("receipts").remove([existing.invoice_path]);
  }

  revalidateAll();
}

// A pick list feeding the "client" dropdown on the debts page's
// ad-hoc-charge form and the income form's "paying client" field, alongside
// the fleet's own boats (see 0074_mys_clients_and_income_fields.sql for why
// this is deliberately not a foreign key target for either). Also carries
// optional contact/company details (0092_mys_client_contact_details.sql),
// editable from /mys/clients and used to auto-fill an invoice's
// client_email/client_company_details when this client is picked.
function revalidateMysClients() {
  revalidatePath("/mys/clients");
  revalidatePath("/mys/debts");
  revalidatePath("/mys/income");
  revalidatePath("/mys/expenses");
  revalidatePath("/mys/invoices");
}

export async function createMysClient(formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Client name is required");

  const { error } = await supabase.from("mys_clients").insert({
    name,
    email: emptyToNull(formData.get("email")),
    phone: emptyToNull(formData.get("phone")),
    company_details: emptyToNull(formData.get("company_details")),
  });
  if (error) throw new Error(error.message);

  revalidateMysClients();
}

// Renaming a client here also relabels every existing mys_expenses/
// mys_income/mys_ad_hoc_charges/mys_invoices row that used the old name
// (confirmed with her: a client's historical records should read under
// their current name, not freeze at whatever name was typed at the time).
// The cascade runs first and the mys_clients row itself is only updated
// once every one of those succeeds, so a failed cascade never leaves the
// picklist entry renamed while historical rows still show the old name.
export async function updateMysClient(clientId: string, formData: FormData): Promise<{ error: string } | undefined> {
  await requireManagement();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("mys_clients").select("name").eq("id", clientId).single();
  if (!existing) return { error: "Client not found" };

  const newName = String(formData.get("name") ?? "").trim();
  if (!newName) return { error: "Client name is required" };

  if (newName !== existing.name) {
    const results = await Promise.all([
      supabase.from("mys_expenses").update({ client_name: newName }).eq("client_name", existing.name),
      supabase.from("mys_income").update({ client_name: newName }).eq("client_name", existing.name),
      supabase.from("mys_ad_hoc_charges").update({ client_name: newName }).eq("client_name", existing.name),
      supabase.from("mys_invoices").update({ client_name: newName }).eq("client_name", existing.name),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("updateMysClient: failed renaming historical records", failed.error);
      return { error: "Failed to update historical records with the new name - the client wasn't renamed" };
    }
  }

  const { error } = await supabase
    .from("mys_clients")
    .update({
      name: newName,
      email: emptyToNull(formData.get("email")),
      phone: emptyToNull(formData.get("phone")),
      company_details: emptyToNull(formData.get("company_details")),
    })
    .eq("id", clientId);
  if (error) throw new Error(error.message);

  revalidateMysClients();
}

// Removes only the picklist suggestion entry - never touches historical
// expenses/income/charges/invoices that already used this client's name
// (same reasoning as deleting a supplier, src/lib/actions/mys-commissions.ts).
export async function deleteMysClient(clientId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_clients").delete().eq("id", clientId);
  if (error) throw new Error(error.message);

  revalidateMysClients();
}

export async function deleteMysIncome(incomeId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("mys_income").select("invoice_path").eq("id", incomeId).single();
  const { error } = await supabase.from("mys_income").delete().eq("id", incomeId);
  if (error) throw new Error(error.message);

  if (existing?.invoice_path) await supabase.storage.from("receipts").remove([existing.invoice_path]);

  revalidateAll();
}

// After any insert/update of a mys_debt_settlements row, re-sums everything
// paid against the debt row it belongs to and syncs the same "settled"
// markers the old one-click settleMysCharge/markMysAdHocChargePaid used to
// set directly (expenses.mys_charge_settled_at / mys_ad_hoc_charges.status+
// paid_date). Symmetric in both directions - covers not just reaching full
// payment, but also an edit that brings an already-fully-paid row back
// below its full amount (e.g. correcting a payment down), which reopens it
// exactly like reopenExpensePlan does for a boat's own payment plans.
async function syncMysDebtSettledStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: "charge" | "ad_hoc",
  id: string
) {
  const fullAmount =
    kind === "charge"
      ? (await supabase.from("expenses").select("amount").eq("id", id).single()).data?.amount
      : (await supabase.from("mys_ad_hoc_charges").select("amount").eq("id", id).single()).data?.amount;
  if (fullAmount == null) return;

  const { data: settlements } = await supabase
    .from("mys_debt_settlements")
    .select("amount, paid_date")
    .eq(kind === "charge" ? "expense_id" : "ad_hoc_charge_id", id);

  const totalPaid = round2((settlements ?? []).reduce((s, p) => s + p.amount, 0));
  const isFullyPaid = totalPaid >= round2(fullAmount);

  if (kind === "charge") {
    const { error } = await supabase
      .from("expenses")
      .update({ mys_charge_settled_at: isFullyPaid ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    if (isFullyPaid) {
      const latestPaidDate = (settlements ?? []).reduce((max, p) => (p.paid_date > max ? p.paid_date : max), todayLocalISO());
      const { error } = await supabase.from("mys_ad_hoc_charges").update({ status: "paid", paid_date: latestPaidDate }).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("mys_ad_hoc_charges").update({ status: "unpaid", paid_date: null }).eq("id", id);
      if (error) throw new Error(error.message);
    }
  }
}

// Auto-records the income the moment any payment (partial or full) is
// recorded against a boat charge or ad-hoc charge debt (addMysDebtSettlement
// below) - she shouldn't have to separately re-type what was just paid to
// have it show up on /mys/income, mirroring what addMysInvoicePayment does
// for invoice payments. Stamps the new income row's id back onto the
// settlement so a later edit/delete of that settlement can keep the income
// entry in sync (see updateMysDebtSettlement/deleteMysDebtSettlement).
async function createLinkedIncomeForSettlement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: "charge" | "ad_hoc",
  targetId: string,
  settlementId: string,
  amount: number,
  paidDate: string,
  paymentMethod: PaymentMethod | null,
  notes: string | null
) {
  let description = "";
  let clientName: string | null = null;
  if (kind === "charge") {
    const { data: expense } = await supabase.from("expenses").select("description, boat_id").eq("id", targetId).single();
    description = expense?.description ?? "";
    if (expense?.boat_id) {
      const { data: boat } = await supabase.from("boats").select("name").eq("id", expense.boat_id).single();
      clientName = boat?.name ?? null;
    }
  } else {
    const { data: charge } = await supabase.from("mys_ad_hoc_charges").select("description, client_name").eq("id", targetId).single();
    description = charge?.description ?? "";
    clientName = charge?.client_name ?? null;
  }

  const { data: income, error: incomeError } = await supabase
    .from("mys_income")
    .insert({
      description,
      amount,
      income_date: paidDate,
      client_name: clientName,
      payment_method: paymentMethod,
      notes,
      linked_expense_id: kind === "charge" ? targetId : null,
      linked_ad_hoc_charge_id: kind === "ad_hoc" ? targetId : null,
    })
    .select("id")
    .single();
  if (incomeError || !income) {
    console.error("createLinkedIncomeForSettlement: failed to auto-record income", incomeError);
    return;
  }
  await supabase.from("mys_debt_settlements").update({ mys_income_id: income.id }).eq("id", settlementId);
  revalidatePath("/mys/income");
}

// Records a (possibly partial) payment against a boat charge or ad-hoc
// charge debt row (see 0093_mys_debt_settlements.sql) - a partial payment
// leaves the row open on /mys/debts showing what's still owed, exactly as
// she asked. boatId is only used (for a "charge") to revalidate that
// boat's own finance pages too, since the expense row itself is rendered
// there. linkedIncomeId is set only by linkMysIncomeToDebt, which already
// created its own income row for this exact payment on the /mys/income
// side - passing it here just stamps that id onto the settlement instead
// of creating a second (duplicate) income row.
export async function addMysDebtSettlement(
  kind: "charge" | "ad_hoc",
  id: string,
  boatId: string | null,
  formData: FormData,
  linkedIncomeId?: string
): Promise<{ error: string } | undefined> {
  const profile = await requireManagement();
  const supabase = await createClient();

  const amount = Number(formData.get("amount") ?? 0);
  // Returned, not thrown - see deleteMysExpense's comment on why.
  if (amount <= 0) return { error: "Payment amount must be greater than zero" };
  const paidDate = emptyToUndefined(formData.get("paid_date"));
  const paymentMethod = emptyToNull(formData.get("payment_method")) as PaymentMethod | null;
  const notes = emptyToNull(formData.get("notes"));

  const { data: settlement, error: insertError } = await supabase
    .from("mys_debt_settlements")
    .insert({
      expense_id: kind === "charge" ? id : null,
      ad_hoc_charge_id: kind === "ad_hoc" ? id : null,
      amount,
      paid_date: paidDate,
      payment_method: paymentMethod,
      notes,
      created_by: profile.id,
    })
    .select("id, paid_date")
    .single();
  if (insertError || !settlement) throw new Error(insertError?.message ?? "Failed to record payment");

  await syncMysDebtSettledStatus(supabase, kind, id);

  if (linkedIncomeId) {
    await supabase.from("mys_debt_settlements").update({ mys_income_id: linkedIncomeId }).eq("id", settlement.id);
  } else {
    await createLinkedIncomeForSettlement(supabase, kind, id, settlement.id, amount, settlement.paid_date, paymentMethod, notes);
  }

  if (kind === "charge" && boatId) revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidateDebts();
}

// Edits a previously-recorded settlement (e.g. fixing an amount, date, or
// payment method typo) - re-syncs the parent debt row's settled status
// afterward, since correcting the amount can change whether it's now fully
// paid (either direction). Also keeps this settlement's auto-recorded
// income entry (if it has one - see createLinkedIncomeForSettlement) in
// sync with the correction, so /mys/income never shows a stale copy of
// what the payment used to be.
export async function updateMysDebtSettlement(
  settlementId: string,
  kind: "charge" | "ad_hoc",
  targetId: string,
  boatId: string | null,
  formData: FormData
): Promise<{ error: string } | undefined> {
  await requireManagement();
  const supabase = await createClient();

  const amount = Number(formData.get("amount") ?? 0);
  if (amount <= 0) return { error: "Payment amount must be greater than zero" };
  const paidDate = emptyToUndefined(formData.get("paid_date"));
  const paymentMethod = emptyToNull(formData.get("payment_method")) as PaymentMethod | null;
  const notes = emptyToNull(formData.get("notes"));

  const { data: updated, error } = await supabase
    .from("mys_debt_settlements")
    .update({ amount, paid_date: paidDate, payment_method: paymentMethod, notes })
    .eq("id", settlementId)
    .select("mys_income_id")
    .single();
  if (error) throw new Error(error.message);

  await syncMysDebtSettledStatus(supabase, kind, targetId);

  if (updated?.mys_income_id) {
    await supabase
      .from("mys_income")
      .update({ amount, income_date: paidDate, payment_method: paymentMethod, notes })
      .eq("id", updated.mys_income_id);
    revalidatePath("/mys/income");
  }

  if (kind === "charge" && boatId) revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidateDebts();
}

// Removes a previously-recorded (possibly mistaken/duplicate) settlement
// outright - e.g. the double €80 entry that overpaid a debt into a
// negative remaining balance. Re-syncs the parent debt's settled status
// afterward, same as updateMysDebtSettlement - deleting one can reopen an
// already-"paid" row exactly like editing its amount down can. Also
// deletes this settlement's auto-recorded income entry (if it has one),
// since that income row only ever existed to represent this exact payment
// - leaving it behind once the payment itself is gone would double-count
// nothing, but would misrepresent income that was never actually received.
export async function deleteMysDebtSettlement(
  settlementId: string,
  kind: "charge" | "ad_hoc",
  targetId: string,
  boatId: string | null
) {
  await requireManagement();
  const supabase = await createClient();

  const { data: deleted, error } = await supabase
    .from("mys_debt_settlements")
    .delete()
    .eq("id", settlementId)
    .select("mys_income_id")
    .single();
  if (error) throw new Error(error.message);

  await syncMysDebtSettledStatus(supabase, kind, targetId);

  if (deleted?.mys_income_id) {
    await supabase.from("mys_income").delete().eq("id", deleted.mys_income_id);
    revalidatePath("/mys/income");
  }

  if (kind === "charge" && boatId) revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidateDebts();
}

// Keeps the originating mys_expenses "boat_payment" row in sync when its
// mirrored debt-side record (a boat's expenses row, or an mys_ad_hoc_charges
// row) is edited directly from /mys/debts instead - the reverse of what
// mirrorBoatPaymentExpense/updateMysExpense already do forward.
// description/date always follow; amount follows onto whichever field
// actually drove this debt's own amount at creation time - client_price if
// a markup was applied, otherwise amount itself (a markup-free debt's
// amount is the raw cost 1:1).
async function syncMysExpenseFromDebtEdit(
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

// Edits a "charge"-kind debt row directly from /mys/debts - since that row
// IS a real boat expenses row (paid_by='management'), this writes straight
// to it (description/amount/date only, not the other expense fields a full
// edit form would touch) rather than through the boat side's own generic
// updateExpense, which would also require/overwrite category/payment_method/
// paid_by. Reverse-syncs the mys_expenses row that originally mirrored this
// charge into existence, if any.
export async function updateMysDebtCharge(boatId: string, expenseId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const date = emptyToNull(formData.get("date"));

  const { error } = await supabase.from("expenses").update({ description, amount, expense_date: date }).eq("id", expenseId);
  if (error) throw new Error(error.message);

  await syncMysExpenseFromDebtEdit(supabase, "linked_expense_id", expenseId, { description, amount, date });

  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/mys/expenses");
  revalidateDebts();
}

// Deletes a "charge"-kind debt row directly from /mys/debts - i.e. actually
// deletes the real boat expense it is (via the same deleteExpense() the
// boat's own Expenses page uses, attachment/storage cleanup included), not
// just a local removal from this list. The mys_expenses row that mirrored
// it into existence, if any, isn't deleted - its own link column just goes
// null (on delete set null, see 0087_mys_expense_linked_boat_expense.sql),
// leaving her own cost bookkeeping intact but no longer tracked as a debt.
export async function deleteMysDebtCharge(boatId: string, expenseId: string, receiptPath: string | null, photoPath: string | null) {
  await requireManagement();
  await deleteExpense(boatId, expenseId, receiptPath, photoPath);
  revalidatePath("/mys/expenses");
  revalidateDebts();
}

// Edits an "ad_hoc"-kind debt row directly from /mys/debts. Reverse-syncs
// the mys_expenses row that mirrored this charge into existence, if any -
// see syncMysExpenseFromDebtEdit above.
export async function updateMysAdHocCharge(chargeId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const date = emptyToNull(formData.get("date"));

  const { error } = await supabase
    .from("mys_ad_hoc_charges")
    .update({ description, amount, charge_date: date ?? undefined })
    .eq("id", chargeId);
  if (error) throw new Error(error.message);

  await syncMysExpenseFromDebtEdit(supabase, "linked_ad_hoc_charge_id", chargeId, { description, amount, date });

  revalidatePath("/mys/expenses");
  revalidateDebts();
}

// Charging a client/boat for something. If the picked name is an actual
// fleet boat (checked here server-side, never trusted from the client),
// this writes a real `expenses` row on that boat instead of a standalone
// mys_ad_hoc_charges one - paid_by: 'management' is the exact same flag a
// boat's own expense form already uses for "MYS covered this cost", and
// the debts page already surfaces every such unsettled expense
// automatically (see mys/debts/page.tsx's `charges` query) - so a boat
// charge needs no separate debt-tracking record of its own, and appears
// directly in that boat's own Expenses list at the same time. Only a name
// that matches no real boat (a genuinely one-off/external client) still
// goes into mys_ad_hoc_charges, exactly as before.
export async function createMysAdHocCharge(formData: FormData) {
  const profile = await requireManagement();
  const supabase = await createClient();

  const clientName = String(formData.get("client_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const chargeDate = emptyToUndefined(formData.get("charge_date"));
  const notes = emptyToNull(formData.get("notes"));

  const { data: matchedBoat } = await supabase.from("boats").select("id").eq("name", clientName).maybeSingle();

  if (matchedBoat) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("expenses").insert({
      boat_id: matchedBoat.id,
      description,
      amount,
      category: "other",
      paid_by: "management",
      // Same reasoning as mirrorBoatPaymentExpense above - a genuine
      // MYS-initiated client charge, always a real debt.
      bill_to_mys: true,
      expense_date: chargeDate,
      notes,
      status: "approved",
      created_by: profile.id,
      approved_by: profile.id,
      approved_at: now,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/boats/${matchedBoat.id}/finance/expenses`);
    revalidatePath(`/boats/${matchedBoat.id}`);
  } else {
    const { error } = await supabase.from("mys_ad_hoc_charges").insert({
      client_name: clientName,
      description,
      amount,
      charge_date: chargeDate,
      notes,
    });
    if (error) throw new Error(error.message);
  }

  revalidateDebts();
}

export async function deleteMysAdHocCharge(chargeId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_ad_hoc_charges").delete().eq("id", chargeId);
  if (error) throw new Error(error.message);

  // The originating mys_expenses row (if any) just loses its link (on
  // delete set null) rather than being deleted itself - revalidate so its
  // now-stale "also added to debts" note disappears from /mys/expenses too.
  revalidatePath("/mys/expenses");
  revalidateDebts();
}

function revalidateInvoices() {
  revalidatePath("/mys");
  revalidatePath("/mys/invoices");
  revalidatePath("/mys/debts");
}

// Starts as 'draft' - invoice_number/issued_date fill in from the table's
// own defaults (see 0073_mys_module.sql). Moving to 'sent' is a separate
// explicit step (markMysInvoiceSent) rather than automatic on creation, so
// a draft can be reviewed/corrected before it counts as issued - and, once
// createStripePaymentLinkForInvoice exists, generating the payment link
// will perform that same transition itself.
export async function createMysInvoice(formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_invoices").insert({
    boat_id: emptyToNull(formData.get("boat_id")),
    client_name: String(formData.get("client_name") ?? "").trim(),
    client_email: emptyToNull(formData.get("client_email")),
    description: String(formData.get("description") ?? "").trim(),
    amount: Number(formData.get("amount") ?? 0),
    due_date: emptyToNull(formData.get("due_date")),
  });

  if (error) throw new Error(error.message);
  revalidateInvoices();
}

// Signed upload URL for the real invoice document she issues through her
// external accounting software - same direct-to-storage pattern as
// createMysExpenseUploadUrl/createMysIncomeUploadUrl above.
export async function createMysInvoiceUploadUrl(fileName: string) {
  await requireManagement();
  const supabase = await createClient();
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const storagePath = `mys/${Date.now()}_${safeName}`;
  const { data, error } = await supabase.storage.from("receipts").createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);
  return { path: storagePath, token: data.token };
}

// Lightweight sibling to updateMysInvoice, scoped to just the attached real
// invoice file (invoice_path) - the Invoices page's per-row upload control
// uses this instead, now that editing the invoice's own fields (client/
// description/amount/status) lives on the Debts page's invoice-row actions.
export async function updateMysInvoiceFile(invoiceId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("mys_invoices").select("invoice_path").eq("id", invoiceId).single();
  const invoicePath = emptyToNull(formData.get("invoice_path"));

  const { error } = await supabase.from("mys_invoices").update({ invoice_path: invoicePath }).eq("id", invoiceId);
  if (error) throw new Error(error.message);

  if (existing?.invoice_path && existing.invoice_path !== invoicePath) {
    await supabase.storage.from("receipts").remove([existing.invoice_path]);
  }

  revalidateInvoices();
}

// Lets an invoice be corrected before it's paid - client/description/
// due-date always; amount/vat_amount only when this invoice has no
// mys_invoice_lines (a plain manually-typed invoice, where she already
// enters the amount directly at creation) - a combined-from-debts
// invoice's amount/vat_amount must stay exactly what they were computed as
// from its real linked expenses/charges, or the invoice total would drift
// from what those records actually say. Refused once 'paid' - the amount
// then represents money already reconciled as received, same reasoning
// updateMysSupplierCommission already applies once a commission is paid.
// invoice_path is left untouched unless the caller explicitly sends it
// (formData.has, not just a truthy value) - the file itself is managed
// only from the Invoices page's own upload/remove controls
// (updateMysInvoiceFile), never as a side effect of editing these fields.
export async function updateMysInvoice(invoiceId: string, formData: FormData): Promise<{ error: string } | undefined> {
  await requireManagement();
  const supabase = await createClient();

  const [{ data: existing }, { count: lineCount }] = await Promise.all([
    supabase.from("mys_invoices").select("status, invoice_path").eq("id", invoiceId).single(),
    supabase.from("mys_invoice_lines").select("id", { count: "exact", head: true }).eq("invoice_id", invoiceId),
  ]);
  // Returned, not thrown - see deleteMysExpense's comment on why.
  if (existing?.status === "paid") {
    return { error: "This invoice has already been marked paid and can't be edited" };
  }

  const invoicePath = formData.has("invoice_path") ? emptyToNull(formData.get("invoice_path")) : (existing?.invoice_path ?? null);

  const { error } = await supabase
    .from("mys_invoices")
    .update({
      client_name: String(formData.get("client_name") ?? "").trim(),
      client_email: emptyToNull(formData.get("client_email")),
      client_company_details: emptyToNull(formData.get("client_company_details")),
      description: String(formData.get("description") ?? "").trim(),
      due_date: emptyToNull(formData.get("due_date")),
      invoice_path: invoicePath,
      ...(lineCount === 0
        ? { amount: Number(formData.get("amount") ?? 0), vat_amount: Number(formData.get("vat_amount") ?? 0) }
        : {}),
    })
    .eq("id", invoiceId);

  if (error) throw new Error(error.message);

  if (existing?.invoice_path && existing.invoice_path !== invoicePath) {
    await supabase.storage.from("receipts").remove([existing.invoice_path]);
  }

  revalidateInvoices();
}

// Corrects one line of a combined-from-debts invoice (description/amount/
// VAT%) after issuing - e.g. fixing a rate or a typo. vat_amount is always
// recomputed here from amount*vat_percent, never trusted from the client
// (same rule createMysInvoiceFromDebts already applies at creation time).
// Since a lines-based invoice's own amount/vat_amount are just the sum of
// its lines (updateMysInvoice refuses to edit them directly - see above),
// editing a line has to also re-sum every line back onto the parent
// mys_invoices row, or the header total would silently drift from what its
// lines actually say.
export async function updateMysInvoiceLine(lineId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const { data: line } = await supabase.from("mys_invoice_lines").select("invoice_id").eq("id", lineId).single();
  if (!line) throw new Error("Invoice line not found");

  const amount = Number(formData.get("amount") ?? 0);
  const vatPercent = Number(formData.get("vat_percent") ?? 0);
  const vatAmount = round2(amount * (vatPercent / 100));

  const { error: lineError } = await supabase
    .from("mys_invoice_lines")
    .update({
      description: String(formData.get("description") ?? "").trim(),
      amount,
      vat_percent: vatPercent,
      vat_amount: vatAmount,
    })
    .eq("id", lineId);
  if (lineError) throw new Error(lineError.message);

  const { data: allLines } = await supabase.from("mys_invoice_lines").select("amount, vat_amount").eq("invoice_id", line.invoice_id);
  const totalAmount = round2((allLines ?? []).reduce((s, l) => s + l.amount, 0));
  const totalVat = round2((allLines ?? []).reduce((s, l) => s + l.vat_amount, 0));

  const { error: invoiceError } = await supabase
    .from("mys_invoices")
    .update({ amount: totalAmount, vat_amount: totalVat })
    .eq("id", line.invoice_id);
  if (invoiceError) throw new Error(invoiceError.message);

  revalidateInvoices();
}

// Detaches one line from a combined-from-debts invoice and returns its
// source (the boat expense or ad-hoc charge it was billed from) to the open
// debts list - the exact inverse of the link createMysInvoiceFromDebts
// writes when the line is first created. Refused once the invoice has any
// payment recorded against it (same caution voidMysInvoice applies) or is
// already void, since either means the invoice's current total is no
// longer just "whatever its lines add up to" - unlinking a line then would
// silently make the numbers wrong instead of safely reopening a debt. If
// this was the invoice's last remaining line, the now-empty invoice
// (nothing left to bill) is deleted outright rather than left behind as a
// zero-value phantom.
export async function removeMysInvoiceLine(lineId: string): Promise<{ error: string } | undefined> {
  await requireManagement();
  const supabase = await createClient();

  const { data: line } = await supabase
    .from("mys_invoice_lines")
    .select("id, invoice_id, source_type, source_id")
    .eq("id", lineId)
    .single();
  if (!line) throw new Error("Invoice line not found");

  const [{ data: invoice }, { count: paymentCount }] = await Promise.all([
    supabase.from("mys_invoices").select("status").eq("id", line.invoice_id).single(),
    supabase.from("mys_invoice_payments").select("id", { count: "exact", head: true }).eq("invoice_id", line.invoice_id),
  ]);
  if (!invoice) throw new Error("Invoice not found");
  // Returned, not thrown - see deleteMysExpense's comment on why: this
  // app's production build redacts a thrown Server Action error's message.
  if (invoice.status === "void") return { error: "This invoice is already void" };
  if (paymentCount && paymentCount > 0) {
    return { error: "This invoice already has payments recorded against it and can't be changed" };
  }

  const { error: deleteLineError } = await supabase.from("mys_invoice_lines").delete().eq("id", lineId);
  if (deleteLineError) throw new Error(deleteLineError.message);

  if (line.source_type === "charge" && line.source_id) {
    await supabase.from("expenses").update({ mys_invoice_id: null }).eq("id", line.source_id);
  } else if (line.source_type === "ad_hoc" && line.source_id) {
    await supabase.from("mys_ad_hoc_charges").update({ invoice_id: null }).eq("id", line.source_id);
  }

  const { data: remainingLines } = await supabase.from("mys_invoice_lines").select("amount, vat_amount").eq("invoice_id", line.invoice_id);

  if (!remainingLines || remainingLines.length === 0) {
    const { error: deleteInvoiceError } = await supabase.from("mys_invoices").delete().eq("id", line.invoice_id);
    if (deleteInvoiceError) throw new Error(deleteInvoiceError.message);
  } else {
    const totalAmount = round2(remainingLines.reduce((s, l) => s + l.amount, 0));
    const totalVat = round2(remainingLines.reduce((s, l) => s + l.vat_amount, 0));
    const { error: invoiceError } = await supabase
      .from("mys_invoices")
      .update({ amount: totalAmount, vat_amount: totalVat })
      .eq("id", line.invoice_id);
    if (invoiceError) throw new Error(invoiceError.message);
  }

  revalidateInvoices();
}

// Combines several still-open MYS debts (a boat's own paid_by='management'
// expense, or an mys_ad_hoc_charges row - see mys-debts-manager.tsx's
// checkbox selection) into one invoice, with an independently chosen VAT%
// per line. Called directly with a typed array rather than through a
// <form action>, since the line list is dynamic - same shape as
// importMysBankStatementLines(lines) in mys-bank-statement.ts.
//
// Every line is re-verified against its real source row here, and amount
// is always recomputed from that row - the client only ever supplies
// vatPercent (a rate she's choosing), never a money figure to trust as-is.
// A source that's no longer open (already settled/invoiced since the page
// loaded) is silently skipped rather than failing the whole invoice - the
// UI's own selection was necessarily built from a slightly stale read.
export async function createMysInvoiceFromDebts({
  clientName,
  boatId,
  description,
  clientEmail,
  dueDate,
  lines,
}: {
  clientName: string;
  boatId: string | null;
  // Typed by her, never guessed from the line items - see mys-invoice-
  // from-debts-form.tsx. Left blank stays blank (mys_invoices.description
  // is not-null, so "" rather than a joined string is the actual "empty").
  description: string;
  clientEmail: string | null;
  dueDate: string | null;
  lines: { sourceType: "charge" | "ad_hoc"; sourceId: string; vatPercent: number }[];
}) {
  const profile = await requireManagement();
  const supabase = await createClient();

  const verifiedLines: { description: string; amount: number; vatPercent: number; vatAmount: number; sourceType: "charge" | "ad_hoc"; sourceId: string }[] = [];

  for (const l of lines) {
    const vatPercent = Number(l.vatPercent) || 0;
    if (l.sourceType === "charge") {
      const { data: expense } = await supabase
        .from("expenses")
        .select("id, description, amount, paid_by, bill_to_mys, status, is_payment_plan, mys_invoice_id")
        .eq("id", l.sourceId)
        .single();
      if (
        !expense ||
        expense.paid_by !== "management" ||
        !expense.bill_to_mys ||
        expense.status !== "approved" ||
        expense.is_payment_plan ||
        expense.mys_invoice_id
      )
        continue;
      verifiedLines.push({
        description: expense.description,
        amount: expense.amount,
        vatPercent,
        vatAmount: round2(expense.amount * (vatPercent / 100)),
        sourceType: "charge",
        sourceId: expense.id,
      });
    } else {
      const { data: charge } = await supabase
        .from("mys_ad_hoc_charges")
        .select("id, description, amount, status, invoice_id")
        .eq("id", l.sourceId)
        .single();
      if (!charge || charge.status !== "unpaid" || charge.invoice_id) continue;
      verifiedLines.push({
        description: charge.description,
        amount: charge.amount,
        vatPercent,
        vatAmount: round2(charge.amount * (vatPercent / 100)),
        sourceType: "ad_hoc",
        sourceId: charge.id,
      });
    }
  }

  if (verifiedLines.length === 0) throw new Error("Nothing left to invoice - these debts may already be settled or invoiced elsewhere");

  const amount = round2(verifiedLines.reduce((s, l) => s + l.amount, 0));
  const vatAmount = round2(verifiedLines.reduce((s, l) => s + l.vatAmount, 0));

  const { data: invoice, error: invoiceError } = await supabase
    .from("mys_invoices")
    .insert({
      boat_id: boatId,
      client_name: clientName,
      client_email: clientEmail,
      description,
      amount,
      vat_amount: vatAmount,
      due_date: dueDate,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (invoiceError) throw new Error(invoiceError.message);

  const { error: linesError } = await supabase.from("mys_invoice_lines").insert(
    verifiedLines.map((l) => ({
      invoice_id: invoice.id,
      description: l.description,
      amount: l.amount,
      vat_percent: l.vatPercent,
      vat_amount: l.vatAmount,
      source_type: l.sourceType,
      source_id: l.sourceId,
    }))
  );
  if (linesError) {
    await supabase.from("mys_invoices").delete().eq("id", invoice.id);
    throw new Error(linesError.message);
  }

  // Best-effort: the invoice itself (the primary intent) is already
  // correctly created and financially accurate regardless of whether these
  // source-linking writes all land - a failure here just means one of
  // these debts could still show as open on /mys/debts alongside its new
  // invoice, worth fixing by hand rather than losing the invoice over.
  const linkWrites = verifiedLines.map((l) =>
    l.sourceType === "charge"
      ? supabase.from("expenses").update({ mys_invoice_id: invoice.id }).eq("id", l.sourceId)
      : supabase.from("mys_ad_hoc_charges").update({ invoice_id: invoice.id }).eq("id", l.sourceId)
  );
  const linkResults = await Promise.all(linkWrites);
  for (const r of linkResults) {
    if (r.error) console.error("createMysInvoiceFromDebts: failed to link a source row to its invoice", r.error);
  }

  revalidateInvoices();
}

export async function markMysInvoiceSent(invoiceId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_invoices").update({ status: "sent" }).eq("id", invoiceId);
  if (error) throw new Error(error.message);

  revalidateInvoices();
}

// Records one payment against an invoice - not necessarily the full
// remaining balance, so an invoice not paid in full still has an accurate
// paid-so-far figure instead of only an all-or-nothing "mark paid".
// Recomputes the running total from every payment on file (never just
// assumes this one completes it) and only flips status to 'paid' once that
// sum actually covers amount + vat_amount; a partial payment leaves status
// as 'sent' with the payment recorded. Every payment - partial or the one
// that completes it - gets its own mys_income row immediately (not just a
// single lump sum once the invoice happens to reach "paid"), so a partial
// payment shows up on /mys/income right away, same as she asked.
// linkedIncomeId is set only by linkMysIncomeToDebt, which already created
// its own income row for this exact payment on the /mys/income side -
// passing it here just stamps that id onto the payment instead of creating
// a second (duplicate) income row.
export async function addMysInvoicePayment(
  invoiceId: string,
  formData: FormData,
  linkedIncomeId?: string
): Promise<{ error: string } | undefined> {
  const profile = await requireManagement();
  const supabase = await createClient();

  const amount = Number(formData.get("amount") ?? 0);
  // Returned, not thrown - see deleteMysExpense's comment on why.
  if (amount <= 0) return { error: "Payment amount must be greater than zero" };
  const paidDate = emptyToUndefined(formData.get("paid_date"));
  const notes = emptyToNull(formData.get("notes"));

  const { data: payment, error: insertError } = await supabase
    .from("mys_invoice_payments")
    .insert({ invoice_id: invoiceId, amount, paid_date: paidDate, notes, created_by: profile.id })
    .select("id, paid_date")
    .single();
  if (insertError || !payment) throw new Error(insertError?.message ?? "Failed to record payment");

  const [{ data: invoice }, { data: payments }] = await Promise.all([
    supabase
      .from("mys_invoices")
      .select("amount, vat_amount, status, description, client_name, invoice_path")
      .eq("id", invoiceId)
      .single(),
    supabase.from("mys_invoice_payments").select("amount, paid_date").eq("invoice_id", invoiceId),
  ]);
  if (invoice) {
    const totalPaid = round2((payments ?? []).reduce((s, p) => s + p.amount, 0));
    if (totalPaid >= round2(invoice.amount + invoice.vat_amount) && invoice.status !== "paid") {
      const latestPaidDate = (payments ?? []).reduce((max, p) => (p.paid_date > max ? p.paid_date : max), payment.paid_date);
      const { error: statusError } = await supabase
        .from("mys_invoices")
        .update({ status: "paid", paid_date: latestPaidDate })
        .eq("id", invoiceId);
      if (statusError) throw new Error(statusError.message);
    }

    if (linkedIncomeId) {
      await supabase.from("mys_invoice_payments").update({ mys_income_id: linkedIncomeId }).eq("id", payment.id);
    } else {
      const { data: income, error: incomeError } = await supabase
        .from("mys_income")
        .insert({
          description: invoice.description,
          amount,
          income_date: payment.paid_date,
          client_name: invoice.client_name,
          invoice_path: invoice.invoice_path,
          invoice_issued: invoice.invoice_path != null,
          mys_invoice_id: invoiceId,
        })
        .select("id")
        .single();
      if (incomeError || !income) console.error("addMysInvoicePayment: failed to auto-record income", incomeError);
      else {
        await supabase.from("mys_invoice_payments").update({ mys_income_id: income.id }).eq("id", payment.id);
        revalidatePath("/mys/income");
      }
    }
  }

  revalidateInvoices();
}

// Voiding an invoice built from debts (createMysInvoiceFromDebts) needs a
// choice about what happens to whatever it billed:
//  - "reopen" (the default, and the only behavior this had before) frees
//    every line's source back to an open debt - otherwise that money would
//    silently vanish from the debts list forever instead of reappearing.
//  - "delete" instead removes those sources outright (a real confirmed
//    delete, not a soft unbill) - for when the charge itself was wrong and
//    she never wants it to reappear as owed. A "charge" source is a real
//    boat expense row, so it's deleted via the same deleteExpense() the
//    boat's own Expenses page uses (attachment/storage cleanup included);
//    an "ad_hoc" source has no attachments, so a plain delete suffices.
// Either way the mys_invoices row itself becomes 'void' (kept as an audit
// trail - see mys_invoice_lines' own comment). Refused outright once any
// payment has been recorded against it - proceeding then would make
// already-received money vanish from tracking instead of just undoing debts
// that were never actually paid.
export async function voidMysInvoice(
  invoiceId: string,
  mode: "reopen" | "delete" = "reopen"
): Promise<{ error: string } | undefined> {
  await requireManagement();
  const supabase = await createClient();

  const { count: paymentCount } = await supabase
    .from("mys_invoice_payments")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);
  // Returned, not thrown - see deleteMysExpense's comment on why.
  if (paymentCount && paymentCount > 0) {
    return { error: "This invoice already has payments recorded against it and can't be voided" };
  }

  const { data: lines } = await supabase
    .from("mys_invoice_lines")
    .select("source_type, source_id")
    .eq("invoice_id", invoiceId);
  const expenseIds = (lines ?? []).filter((l) => l.source_type === "charge" && l.source_id).map((l) => l.source_id as string);
  const adHocIds = (lines ?? []).filter((l) => l.source_type === "ad_hoc" && l.source_id).map((l) => l.source_id as string);

  const { error } = await supabase.from("mys_invoices").update({ status: "void" }).eq("id", invoiceId);
  if (error) throw new Error(error.message);

  if (mode === "delete") {
    if (expenseIds.length > 0) {
      const { data: expensesToDelete } = await supabase
        .from("expenses")
        .select("id, boat_id, receipt_path, photo_path")
        .in("id", expenseIds);
      for (const e of expensesToDelete ?? []) {
        await deleteExpense(e.boat_id, e.id, e.receipt_path, e.photo_path);
      }
    }
    if (adHocIds.length > 0) {
      const { error: deleteAdHocError } = await supabase.from("mys_ad_hoc_charges").delete().in("id", adHocIds);
      if (deleteAdHocError) console.error("voidMysInvoice: failed to delete ad-hoc charge sources", deleteAdHocError);
    }
  } else {
    await Promise.all([
      expenseIds.length > 0 ? supabase.from("expenses").update({ mys_invoice_id: null }).in("id", expenseIds) : Promise.resolve(),
      adHocIds.length > 0 ? supabase.from("mys_ad_hoc_charges").update({ invoice_id: null }).in("id", adHocIds) : Promise.resolve(),
    ]);
  }

  revalidateInvoices();
}

// Actually removes the mys_invoices row (not just marking it 'void') - for
// clearing out an old draft/void invoice she never wants to see again,
// rather than it sitting in the list forever as an audit trail. Same
// payment guard as voidMysInvoice, for the same reason: deleting an
// invoice with real payments recorded against it would cascade-delete that
// payment history too (mys_invoice_payments.invoice_id is "on delete
// cascade"), making already-received money vanish from tracking. Every
// other reference is "on delete set null" (mys_invoice_lines cascades too,
// but that's just the line-item breakdown, no independent value once the
// invoice itself is gone) - deleting a still-open (draft/sent) invoice
// therefore reopens its source charges/ad-hoc rows automatically, the same
// end state voidMysInvoice's "reopen" mode produces on purpose.
export async function deleteMysInvoicePermanently(invoiceId: string): Promise<{ error: string } | undefined> {
  await requireManagement();
  const supabase = await createClient();

  const { count: paymentCount } = await supabase
    .from("mys_invoice_payments")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);
  // Returned, not thrown - see deleteMysExpense's comment on why.
  if (paymentCount && paymentCount > 0) {
    return { error: "This invoice already has payments recorded against it and can't be deleted" };
  }

  const { data: existing } = await supabase.from("mys_invoices").select("invoice_path").eq("id", invoiceId).single();

  const { error } = await supabase.from("mys_invoices").delete().eq("id", invoiceId);
  if (error) throw new Error(error.message);

  if (existing?.invoice_path) await supabase.storage.from("receipts").remove([existing.invoice_path]);

  revalidateInvoices();
  revalidateDebts();
}
