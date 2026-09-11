"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { emptyToNull, emptyToUndefined } from "@/lib/form-utils";
import { todayLocalISO } from "@/lib/date-format";
import { round2 } from "@/lib/money";
import { MYS_SUBCATEGORIES_BY_CATEGORY } from "@/lib/labels";
import type { MysExpenseCategory, PaymentMethod } from "@/lib/types/database";

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
function readMysExpenseFields(formData: FormData) {
  const category = String(formData.get("category") ?? "other") as MysExpenseCategory;
  const amount = Number(formData.get("amount") ?? 0);
  const isBoatPayment = category === "boat_payment";
  const markupPercent = isBoatPayment ? Number(formData.get("markup_percent") ?? 0) || null : null;

  return {
    category,
    subcategory: MYS_SUBCATEGORIES_BY_CATEGORY[category] ? emptyToNull(formData.get("subcategory")) : null,
    description: String(formData.get("description") ?? "").trim(),
    amount,
    expense_date: emptyToUndefined(formData.get("expense_date")),
    payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
    client_name: isBoatPayment ? emptyToNull(formData.get("client_name")) : null,
    markup_percent: markupPercent,
    client_price: isBoatPayment && markupPercent != null ? round2(amount * (1 + markupPercent / 100)) : null,
    invoice_number: emptyToNull(formData.get("invoice_number")),
    notes: emptyToNull(formData.get("notes")),
  };
}

export async function createMysExpense(formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const receiptPath = emptyToNull(formData.get("receipt_path"));
  const { error } = await supabase.from("mys_expenses").insert({
    ...readMysExpenseFields(formData),
    receipt_path: receiptPath,
  });

  if (error) {
    if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]);
    throw new Error(error.message);
  }

  revalidateAll();
}

export async function updateMysExpense(expenseId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("mys_expenses").select("receipt_path").eq("id", expenseId).single();
  const receiptPath = emptyToNull(formData.get("receipt_path"));

  const { error } = await supabase
    .from("mys_expenses")
    .update({
      ...readMysExpenseFields(formData),
      ...(receiptPath ? { receipt_path: receiptPath } : {}),
    })
    .eq("id", expenseId);

  if (error) throw new Error(error.message);

  if (receiptPath && existing?.receipt_path && existing.receipt_path !== receiptPath) {
    await supabase.storage.from("receipts").remove([existing.receipt_path]);
  }

  revalidateAll();
}

export async function deleteMysExpense(expenseId: string, receiptPath: string | null) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_expenses").delete().eq("id", expenseId);
  if (error) throw new Error(error.message);

  if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]);

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

// A small, name-only pick list feeding the "client" dropdown on the debts
// page's ad-hoc-charge form and the income form's "paying client" field,
// alongside the fleet's own boats (see 0074_mys_clients_and_income_fields.sql
// for why this is deliberately not a foreign key target for either).
export async function createMysClient(formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Client name is required");

  const { error } = await supabase.from("mys_clients").insert({ name });
  if (error) throw new Error(error.message);

  revalidatePath("/mys/debts");
  revalidatePath("/mys/income");
  revalidatePath("/mys/expenses");
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

// Marks a boat's own paid_by='management' expense as repaid to MYS - the
// only write this module ever makes onto a real boat's expenses row (see
// 0073_mys_module.sql's comment on mys_charge_settled_at for why this
// isn't a separate synced table). boatId is only used to revalidate that
// boat's own finance pages too, since the expense row itself is rendered
// there.
export async function settleMysCharge(boatId: string, expenseId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase
    .from("expenses")
    .update({ mys_charge_settled_at: new Date().toISOString() })
    .eq("id", expenseId);
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/finance/expenses`);
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

export async function markMysAdHocChargePaid(chargeId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase
    .from("mys_ad_hoc_charges")
    .update({ status: "paid", paid_date: todayLocalISO() })
    .eq("id", chargeId);
  if (error) throw new Error(error.message);

  revalidateDebts();
}

export async function deleteMysAdHocCharge(chargeId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_ad_hoc_charges").delete().eq("id", chargeId);
  if (error) throw new Error(error.message);

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

// Lets an invoice be corrected after issuing - client/description/due-date/
// attached file always; amount/vat_amount only when this invoice has no
// mys_invoice_lines (a plain manually-typed invoice, where she already
// enters the amount directly at creation) - a combined-from-debts
// invoice's amount/vat_amount must stay exactly what they were computed as
// from its real linked expenses/charges, or the invoice total would drift
// from what those records actually say.
export async function updateMysInvoice(invoiceId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const [{ data: existing }, { count: lineCount }] = await Promise.all([
    supabase.from("mys_invoices").select("invoice_path").eq("id", invoiceId).single(),
    supabase.from("mys_invoice_lines").select("id", { count: "exact", head: true }).eq("invoice_id", invoiceId),
  ]);

  const invoicePath = emptyToNull(formData.get("invoice_path"));

  const { error } = await supabase
    .from("mys_invoices")
    .update({
      client_name: String(formData.get("client_name") ?? "").trim(),
      client_email: emptyToNull(formData.get("client_email")),
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
  clientEmail,
  dueDate,
  lines,
}: {
  clientName: string;
  boatId: string | null;
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
        .select("id, description, amount, paid_by, status, is_payment_plan, mys_invoice_id")
        .eq("id", l.sourceId)
        .single();
      if (!expense || expense.paid_by !== "management" || expense.status !== "approved" || expense.is_payment_plan || expense.mys_invoice_id) continue;
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
  const description = verifiedLines.map((l) => l.description).join(" + ");

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
// as 'sent' with the payment recorded.
export async function addMysInvoicePayment(invoiceId: string, formData: FormData) {
  const profile = await requireManagement();
  const supabase = await createClient();

  const amount = Number(formData.get("amount") ?? 0);
  if (amount <= 0) throw new Error("Payment amount must be greater than zero");
  const paidDate = emptyToUndefined(formData.get("paid_date"));
  const notes = emptyToNull(formData.get("notes"));

  const { error: insertError } = await supabase
    .from("mys_invoice_payments")
    .insert({ invoice_id: invoiceId, amount, paid_date: paidDate, notes, created_by: profile.id });
  if (insertError) throw new Error(insertError.message);

  const [{ data: invoice }, { data: payments }] = await Promise.all([
    supabase.from("mys_invoices").select("amount, vat_amount").eq("id", invoiceId).single(),
    supabase.from("mys_invoice_payments").select("amount, paid_date").eq("invoice_id", invoiceId),
  ]);
  if (invoice) {
    const totalPaid = round2((payments ?? []).reduce((s, p) => s + p.amount, 0));
    if (totalPaid >= round2(invoice.amount + invoice.vat_amount)) {
      const latestPaidDate = (payments ?? []).reduce((max, p) => (p.paid_date > max ? p.paid_date : max), paidDate ?? todayLocalISO());
      const { error: statusError } = await supabase
        .from("mys_invoices")
        .update({ status: "paid", paid_date: latestPaidDate })
        .eq("id", invoiceId);
      if (statusError) throw new Error(statusError.message);
    }
  }

  revalidateInvoices();
}

// Voiding an invoice built from debts (createMysInvoiceFromDebts) must free
// up whatever it billed - otherwise that money silently vanishes from the
// debts list forever instead of reappearing as an open debt. The
// mys_invoice_lines rows themselves are left as-is (audit trail of what
// this invoice used to bill, even voided). Refused outright once any
// payment has been recorded against it - voiding then would make already-
// received money vanish from tracking instead of just unbilling debts that
// were never actually paid.
export async function voidMysInvoice(invoiceId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { count: paymentCount } = await supabase
    .from("mys_invoice_payments")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);
  if (paymentCount && paymentCount > 0) {
    throw new Error("This invoice already has payments recorded against it and can't be voided");
  }

  const { data: lines } = await supabase.from("mys_invoice_lines").select("source_type, source_id").eq("invoice_id", invoiceId);
  const expenseIds = (lines ?? []).filter((l) => l.source_type === "charge" && l.source_id).map((l) => l.source_id as string);
  const adHocIds = (lines ?? []).filter((l) => l.source_type === "ad_hoc" && l.source_id).map((l) => l.source_id as string);

  const { error } = await supabase.from("mys_invoices").update({ status: "void" }).eq("id", invoiceId);
  if (error) throw new Error(error.message);

  await Promise.all([
    expenseIds.length > 0 ? supabase.from("expenses").update({ mys_invoice_id: null }).in("id", expenseIds) : Promise.resolve(),
    adHocIds.length > 0 ? supabase.from("mys_ad_hoc_charges").update({ invoice_id: null }).in("id", adHocIds) : Promise.resolve(),
  ]);

  revalidateInvoices();
}
