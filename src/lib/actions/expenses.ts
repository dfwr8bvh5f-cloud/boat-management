"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type { ApprovalStatus, ExpenseCategory, PaidByType, PaymentMethod } from "@/lib/types/database";

async function uploadReceipt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  file: File
): Promise<string> {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from("receipts")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return storagePath;
}

export async function createExpense(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const file = formData.get("receipt");
  const receiptPath =
    file instanceof File && file.size > 0 ? await uploadReceipt(supabase, boatId, file) : null;

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { error } = await supabase.from("expenses").insert({
    boat_id: boatId,
    description: String(formData.get("description") ?? "").trim(),
    invoice_number: emptyToNull(formData.get("invoice_number")),
    amount: Number(formData.get("amount") ?? 0),
    category: (String(formData.get("category") ?? "other") as ExpenseCategory),
    payment_method: (String(formData.get("payment_method") ?? "other") as PaymentMethod),
    paid_by: (String(formData.get("paid_by") ?? "crew") as PaidByType),
    expense_date: String(formData.get("expense_date") ?? new Date().toISOString().slice(0, 10)),
    receipt_path: receiptPath,
    notes: emptyToNull(formData.get("notes")),
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) {
    if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]);
    throw new Error(error.message);
  }

  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}`);
}

export async function updateExpense(boatId: string, expenseId: string, formData: FormData) {
  const supabase = await createClient();

  const file = formData.get("receipt");
  const receiptPath =
    file instanceof File && file.size > 0 ? await uploadReceipt(supabase, boatId, file) : undefined;

  const { error } = await supabase
    .from("expenses")
    .update({
      description: String(formData.get("description") ?? "").trim(),
      invoice_number: emptyToNull(formData.get("invoice_number")),
      amount: Number(formData.get("amount") ?? 0),
      category: (String(formData.get("category") ?? "other") as ExpenseCategory),
      payment_method: (String(formData.get("payment_method") ?? "other") as PaymentMethod),
      paid_by: (String(formData.get("paid_by") ?? "crew") as PaidByType),
      expense_date: String(formData.get("expense_date") ?? new Date().toISOString().slice(0, 10)),
      notes: emptyToNull(formData.get("notes")),
      ...(receiptPath ? { receipt_path: receiptPath } : {}),
    })
    .eq("id", expenseId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}`);
}

export async function deleteExpense(boatId: string, expenseId: string, receiptPath: string | null) {
  const supabase = await createClient();

  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) throw new Error(error.message);

  if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
}

export async function approveExpense(boatId: string, expenseId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    throw new Error("רק תפקיד ניהול יכול לאשר רשומות");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", expenseId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
}
