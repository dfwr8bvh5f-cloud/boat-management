"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { emptyToNull, emptyToUndefined } from "@/lib/form-utils";
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
      notes: emptyToNull(formData.get("notes")),
    })
    .eq("id", incomeId);

  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteMysIncome(incomeId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_income").delete().eq("id", incomeId);
  if (error) throw new Error(error.message);

  revalidateAll();
}
