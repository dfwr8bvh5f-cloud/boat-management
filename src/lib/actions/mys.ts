"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { emptyToNull, emptyToUndefined } from "@/lib/form-utils";
import { todayLocalISO } from "@/lib/date-format";
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

export async function createMysExpense(formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const receiptPath = emptyToNull(formData.get("receipt_path"));
  const { error } = await supabase.from("mys_expenses").insert({
    category: String(formData.get("category") ?? "other") as MysExpenseCategory,
    description: String(formData.get("description") ?? "").trim(),
    amount: Number(formData.get("amount") ?? 0),
    expense_date: emptyToUndefined(formData.get("expense_date")),
    payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
    receipt_path: receiptPath,
    notes: emptyToNull(formData.get("notes")),
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
      category: String(formData.get("category") ?? "other") as MysExpenseCategory,
      description: String(formData.get("description") ?? "").trim(),
      amount: Number(formData.get("amount") ?? 0),
      expense_date: emptyToUndefined(formData.get("expense_date")),
      payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
      notes: emptyToNull(formData.get("notes")),
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

export async function createMysIncome(formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_income").insert({
    description: String(formData.get("description") ?? "").trim(),
    category: emptyToNull(formData.get("category")),
    amount: Number(formData.get("amount") ?? 0),
    income_date: emptyToUndefined(formData.get("income_date")),
    client_name: emptyToNull(formData.get("client_name")),
    payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
    invoice_issued: formData.get("invoice_issued") === "on",
    notes: emptyToNull(formData.get("notes")),
  });

  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateMysIncome(incomeId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase
    .from("mys_income")
    .update({
      description: String(formData.get("description") ?? "").trim(),
      category: emptyToNull(formData.get("category")),
      amount: Number(formData.get("amount") ?? 0),
      income_date: emptyToUndefined(formData.get("income_date")),
      client_name: emptyToNull(formData.get("client_name")),
      payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
      invoice_issued: formData.get("invoice_issued") === "on",
      notes: emptyToNull(formData.get("notes")),
    })
    .eq("id", incomeId);

  if (error) throw new Error(error.message);
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
}

export async function deleteMysIncome(incomeId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_income").delete().eq("id", incomeId);
  if (error) throw new Error(error.message);

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

export async function createMysAdHocCharge(formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_ad_hoc_charges").insert({
    client_name: String(formData.get("client_name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    amount: Number(formData.get("amount") ?? 0),
    charge_date: emptyToUndefined(formData.get("charge_date")),
    notes: emptyToNull(formData.get("notes")),
  });

  if (error) throw new Error(error.message);
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

export async function markMysInvoiceSent(invoiceId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_invoices").update({ status: "sent" }).eq("id", invoiceId);
  if (error) throw new Error(error.message);

  revalidateInvoices();
}

export async function markMysInvoicePaid(invoiceId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase
    .from("mys_invoices")
    .update({ status: "paid", paid_date: todayLocalISO() })
    .eq("id", invoiceId);
  if (error) throw new Error(error.message);

  revalidateInvoices();
}

export async function voidMysInvoice(invoiceId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_invoices").update({ status: "void" }).eq("id", invoiceId);
  if (error) throw new Error(error.message);

  revalidateInvoices();
}
