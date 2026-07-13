"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type {
  ApprovalStatus,
  ExpenseAttachmentKind,
  ExpenseCategory,
  PaidByType,
  PaymentMethod,
} from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/translate";
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
    await sendPushToEmails(EXPENSE_APPROVAL_EMAILS, (locale) => ({
      title: translate(locale, "push_expense_pending_title"),
      body: translate(locale, "push_expense_pending_body", { boat: boat?.name ?? "", description }),
      url: `/boats/${boatId}/finance/expenses`,
    }));
  } catch (e) {
    console.error("expense push notification failed:", e);
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
    await sendPushToEmails(EXPENSE_APPROVAL_EMAILS, (locale) => ({
      title: translate(locale, "push_expense_edited_title"),
      body: translate(locale, "push_expense_edited_body", { boat: boat?.name ?? "", description, editor: editorName }),
      url: `/boats/${boatId}/finance/expenses`,
    }));
  } catch (e) {
    console.error("expense push notification failed:", e);
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

function pickFiles(formData: FormData, fieldName: string): File[] {
  return formData.getAll(fieldName).filter((f): f is File => f instanceof File && f.size > 0);
}

// One or more receipts/photos per expense go into `expense_attachments`,
// one row per file - the legacy singular receipt_path/photo_path columns
// on `expenses` stay populated with the first file of each kind too, for
// backward compatibility with anything reading those columns directly
// (report generation, older views).
async function insertExpenseAttachments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  expenseId: string,
  paths: string[],
  kind: ExpenseAttachmentKind,
  createdBy: string | null
) {
  if (paths.length === 0) return;
  const { error } = await supabase
    .from("expense_attachments")
    .insert(paths.map((file_path) => ({ expense_id: expenseId, boat_id: boatId, kind, file_path, created_by: createdBy })));
  if (error) {
    await supabase.storage.from("receipts").remove(paths);
    throw new Error(error.message);
  }
}

export async function createExpense(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const receiptFiles = pickFiles(formData, "receipts");
  const photoFiles = pickFiles(formData, "photos");
  const receiptPaths = await Promise.all(receiptFiles.map((file) => uploadReceipt(supabase, boatId, file)));
  const photoPaths = await Promise.all(photoFiles.map((file) => uploadReceipt(supabase, boatId, file)));

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { data: inserted, error } = await supabase
    .from("expenses")
    .insert({
      boat_id: boatId,
      description: String(formData.get("description") ?? "").trim(),
      invoice_number: emptyToNull(formData.get("invoice_number")),
      amount: Number(formData.get("amount") ?? 0),
      category: (String(formData.get("category") ?? "other") as ExpenseCategory),
      payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
      paid_by: (String(formData.get("paid_by") ?? "crew") as PaidByType),
      expense_date: emptyToNull(formData.get("expense_date")),
      receipt_path: receiptPaths[0] ?? null,
      photo_path: photoPaths[0] ?? null,
      notes: emptyToNull(formData.get("notes")),
      is_warranty: formData.get("is_warranty") === "on",
      status,
      created_by: profile.id,
      ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
    })
    .select("id")
    .single();

  if (error) {
    const toRemove = [...receiptPaths, ...photoPaths];
    if (toRemove.length) await supabase.storage.from("receipts").remove(toRemove);
    throw new Error(error.message);
  }

  await insertExpenseAttachments(supabase, boatId, inserted.id, receiptPaths, "receipt", profile.id);
  await insertExpenseAttachments(supabase, boatId, inserted.id, photoPaths, "photo", profile.id);

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

  const { data: existing } = await supabase
    .from("expenses")
    .select("status, receipt_path, photo_path")
    .eq("id", expenseId)
    .single();

  const receiptFiles = pickFiles(formData, "receipts");
  const photoFiles = pickFiles(formData, "photos");
  const receiptPaths = await Promise.all(receiptFiles.map((file) => uploadReceipt(supabase, boatId, file)));
  const photoPaths = await Promise.all(photoFiles.map((file) => uploadReceipt(supabase, boatId, file)));

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
      // An expense created before this feature may still have never had a
      // receipt/photo at all - the first newly-added file of each kind
      // fills that legacy column in, without touching one that's already set.
      ...(!existing?.receipt_path && receiptPaths[0] ? { receipt_path: receiptPaths[0] } : {}),
      ...(!existing?.photo_path && photoPaths[0] ? { photo_path: photoPaths[0] } : {}),
    })
    .eq("id", expenseId);

  if (error) throw new Error(error.message);

  await insertExpenseAttachments(supabase, boatId, expenseId, receiptPaths, "receipt", profile.id);
  await insertExpenseAttachments(supabase, boatId, expenseId, photoPaths, "photo", profile.id);

  if (existing?.status === "approved" && profile.role !== "management") {
    await notifyApprovedExpenseEdited(supabase, boatId, description, profile.full_name ?? "");
  }

  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

export async function removeExpenseAttachment(boatId: string, attachmentId: string, filePath: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("expense_attachments").delete().eq("id", attachmentId);
  if (error) throw new Error(error.message);

  await supabase.storage.from("receipts").remove([filePath]);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
}

// One-click "swap in the date the bank statement suggests" from the
// reconciliation quick-fix icon - touches only expense_date, leaving
// every other field (amount included) exactly as it was.
export async function updateExpenseDateOnly(boatId: string, expenseId: string, newDate: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").update({ expense_date: newDate }).eq("id", expenseId);
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}/finance/bank-reconciliation`);
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

  const { data: attachments } = await supabase
    .from("expense_attachments")
    .select("file_path")
    .eq("expense_id", expenseId);

  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) throw new Error(error.message);

  const toRemove = [receiptPath, photoPath, ...(attachments ?? []).map((a) => a.file_path)].filter(
    (p): p is string => Boolean(p)
  );
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
