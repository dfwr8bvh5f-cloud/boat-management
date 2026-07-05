"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type { ApprovalStatus, ExpenseCategory, PaidByType, PaymentMethod } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";
import { sendPushToEmails } from "@/lib/push";

const EXPENSE_APPROVAL_EMAILS = ["info@medyachtings.com"];

// Push failures shouldn't block expense creation - best-effort only.
async function notifyExpensePending(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  description: string
) {
  try {
    const { data: boat } = await supabase.from("boats").select("name").eq("id", boatId).single();
    await sendPushToEmails(EXPENSE_APPROVAL_EMAILS, {
      title: "הוצאה ממתינה לאישור",
      body: `${boat?.name ?? ""} · ${description}`,
      url: `/boats/${boatId}/finance/expenses`,
    });
  } catch {
    // ignore - VAPID keys not configured, or push provider error
  }
}

// Push failures shouldn't block the edit - best-effort only.
async function notifyApprovedExpenseEdited(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  description: string,
  editorName: string
) {
  try {
    const { data: boat } = await supabase.from("boats").select("name").eq("id", boatId).single();
    await sendPushToEmails(EXPENSE_APPROVAL_EMAILS, {
      title: "הוצאה מאושרת נערכה",
      body: `${boat?.name ?? ""} · ${description} · ${editorName}`,
      url: `/boats/${boatId}/finance/expenses`,
    });
  } catch {
    // ignore - VAPID keys not configured, or push provider error
  }
}

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
  const photoFile = formData.get("photo");
  const photoPath =
    photoFile instanceof File && photoFile.size > 0 ? await uploadReceipt(supabase, boatId, photoFile) : null;

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { error } = await supabase.from("expenses").insert({
    boat_id: boatId,
    description: String(formData.get("description") ?? "").trim(),
    invoice_number: emptyToNull(formData.get("invoice_number")),
    amount: Number(formData.get("amount") ?? 0),
    category: (String(formData.get("category") ?? "other") as ExpenseCategory),
    payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
    paid_by: (String(formData.get("paid_by") ?? "crew") as PaidByType),
    expense_date: emptyToNull(formData.get("expense_date")),
    receipt_path: receiptPath,
    photo_path: photoPath,
    notes: emptyToNull(formData.get("notes")),
    is_warranty: formData.get("is_warranty") === "on",
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) {
    const toRemove = [receiptPath, photoPath].filter((p): p is string => Boolean(p));
    if (toRemove.length) await supabase.storage.from("receipts").remove(toRemove);
    throw new Error(error.message);
  }

  if (status === "pending") {
    await notifyExpensePending(supabase, boatId, String(formData.get("description") ?? "").trim());
  }

  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

export async function updateExpense(boatId: string, expenseId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("expenses").select("status").eq("id", expenseId).single();

  const file = formData.get("receipt");
  const receiptPath =
    file instanceof File && file.size > 0 ? await uploadReceipt(supabase, boatId, file) : undefined;
  const photoFile = formData.get("photo");
  const photoPath =
    photoFile instanceof File && photoFile.size > 0 ? await uploadReceipt(supabase, boatId, photoFile) : undefined;

  const description = String(formData.get("description") ?? "").trim();
  const { error } = await supabase
    .from("expenses")
    .update({
      description,
      invoice_number: emptyToNull(formData.get("invoice_number")),
      amount: Number(formData.get("amount") ?? 0),
      category: (String(formData.get("category") ?? "other") as ExpenseCategory),
      payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
      paid_by: (String(formData.get("paid_by") ?? "crew") as PaidByType),
      expense_date: emptyToNull(formData.get("expense_date")),
      notes: emptyToNull(formData.get("notes")),
      is_warranty: formData.get("is_warranty") === "on",
      ...(receiptPath ? { receipt_path: receiptPath } : {}),
      ...(photoPath ? { photo_path: photoPath } : {}),
    })
    .eq("id", expenseId);

  if (error) throw new Error(error.message);

  if (existing?.status === "approved" && profile.role !== "management") {
    await notifyApprovedExpenseEdited(supabase, boatId, description, profile.full_name ?? "");
  }

  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

export async function removeExpenseReceipt(boatId: string, expenseId: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase.from("expenses").select("receipt_path").eq("id", expenseId).single();
  const { error } = await supabase.from("expenses").update({ receipt_path: null }).eq("id", expenseId);
  if (error) throw new Error(error.message);

  if (existing?.receipt_path) await supabase.storage.from("receipts").remove([existing.receipt_path]);

  revalidatePath(`/boats/${boatId}/finance/expenses`);
}

export async function removeExpensePhoto(boatId: string, expenseId: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase.from("expenses").select("photo_path").eq("id", expenseId).single();
  const { error } = await supabase.from("expenses").update({ photo_path: null }).eq("id", expenseId);
  if (error) throw new Error(error.message);

  if (existing?.photo_path) await supabase.storage.from("receipts").remove([existing.photo_path]);

  revalidatePath(`/boats/${boatId}/finance/expenses`);
}

export async function deleteExpense(boatId: string, expenseId: string, receiptPath: string | null, photoPath: string | null) {
  const supabase = await createClient();

  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) throw new Error(error.message);

  const toRemove = [receiptPath, photoPath].filter((p): p is string => Boolean(p));
  if (toRemove.length) await supabase.storage.from("receipts").remove(toRemove);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

export async function approveExpense(boatId: string, expenseId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", expenseId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

// Lets management correct a pending expense's details in the approvals
// screen and approve it in one step, instead of approving-then-editing.
export async function updateAndApproveExpense(boatId: string, expenseId: string, formData: FormData) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update({
      description: String(formData.get("description") ?? "").trim(),
      invoice_number: emptyToNull(formData.get("invoice_number")),
      amount: Number(formData.get("amount") ?? 0),
      category: (String(formData.get("category") ?? "other") as ExpenseCategory),
      payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
      expense_date: emptyToNull(formData.get("expense_date")),
      notes: emptyToNull(formData.get("notes")),
      status: "approved",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", expenseId);

  if (error) throw new Error(error.message);
  revalidatePath("/approvals");
  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}
