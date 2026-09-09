"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import { round2 } from "@/lib/money";
import { todayLocalISO } from "@/lib/date-format";
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

// The set of pages that show an expense's amount/status, revalidated
// together after any mutation that can change it - mirrors the identical
// helper already in bank-statement.ts, just for this file's own repeated
// block (deliberately narrower than that one: it doesn't include
// bank-reconciliation, since only updateExpenseDateOnly needs that).
function revalidateAll(boatId: string) {
  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

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

// Files are uploaded straight from the browser to storage (see
// createExpenseUploadUrl below) rather than carried through this server
// action's own body - a Next.js server action's request body is capped
// (4mb here, and the underlying platform hard-caps around 4.5mb regardless
// of that setting), so attaching more than one or two receipt photos in the
// same request used to blow past that ceiling and fail with an opaque
// "unexpected response from the server". Only the resulting storage paths
// cross into this action now, which are trivially small regardless of how
// many files were attached.
function pickPaths(formData: FormData, fieldName: string): string[] {
  return formData.getAll(fieldName).filter((v): v is string => typeof v === "string" && v.length > 0);
}

// A payment plan's staged "Payment 1 / Payment 2 / ..." rows travel as
// parallel repeated fields (payment_amount/payment_payment_method/
// payment_expense_date/payment_proof_path), same positional-array idea as
// receipt_paths/photo_paths above - index i across all four describes
// payment i.
function readPlanPayments(formData: FormData) {
  const amounts = formData.getAll("payment_amount");
  const methods = formData.getAll("payment_payment_method");
  const dates = formData.getAll("payment_expense_date");
  const proofPaths = formData.getAll("payment_proof_path");
  return amounts.map((_, i) => ({
    amount: Number(amounts[i] ?? 0),
    payment_method: (String(methods[i] ?? "") || null) as PaymentMethod | null,
    expense_date: emptyToNull(dates[i]) ?? todayLocalISO(),
    proof_path: (String(proofPaths[i] ?? "") || null) as string | null,
  }));
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

// Signed upload URL for one receipt/photo file, so the browser can send its
// bytes directly to storage instead of through createExpense/updateExpense's
// own request body - see the comment on pickPaths above for why.
export async function createExpenseUploadUrl(boatId: string, fileName: string) {
  const profile = await requireProfile();
  if (profile.role !== "management" && profile.boat_id !== boatId) {
    const { t } = await getTranslator();
    throw new Error(t("error_not_authorized"));
  }
  const supabase = await createClient();
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${Date.now()}_${safeName}`;
  const { data, error } = await supabase.storage.from("receipts").createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);
  return { path: storagePath, token: data.token };
}

export async function createExpense(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const receiptPaths = pickPaths(formData, "receipt_paths");
  const photoPaths = pickPaths(formData, "photo_paths");

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { data: inserted, error } = await supabase
    .from("expenses")
    .insert({
      boat_id: boatId,
      description: String(formData.get("description") ?? "").trim(),
      invoice_number: emptyToNull(formData.get("invoice_number")),
      amount: Number(formData.get("amount") ?? 0),
      category: emptyToNull(formData.get("category")) as ExpenseCategory | null,
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

  revalidateAll(boatId);
}

export async function updateExpense(boatId: string, expenseId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("expenses")
    .select("status, receipt_path, photo_path")
    .eq("id", expenseId)
    .single();

  const receiptPaths = pickPaths(formData, "receipt_paths");
  const photoPaths = pickPaths(formData, "photo_paths");

  const description = String(formData.get("description") ?? "").trim();
  const { error } = await supabase
    .from("expenses")
    .update({
      description,
      invoice_number: emptyToNull(formData.get("invoice_number")),
      amount: Number(formData.get("amount") ?? 0),
      category: emptyToNull(formData.get("category")) as ExpenseCategory | null,
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

  revalidateAll(boatId);
}

// A "not yet fully paid" expense: a top-level plan row (is_payment_plan,
// see 0072_expense_payment_plans.sql) holding the shared description/
// category/notes, plus one ordinary `expenses` row per payment already
// staged in the form (parent_expense_id pointing at the plan). Each payment
// row is a real transaction from the moment it's saved - its own amount/
// payment_method/expense_date (today) - it goes through this boat's normal
// per-role pending/approved workflow independently, exactly like any other
// expense, and already reduces the live balance the instant it exists (see
// the is_payment_plan exclusion in balances.ts). The plan row itself stays
// dateless/methodless until finished, which is what keeps it out of every
// balance/report/budget query without a plan-specific filter there.
export async function createExpensePaymentPlan(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  // A blank trailing row (added via "Add payment" but never filled in)
  // must not become a spurious €0 payment.
  const payments = readPlanPayments(formData).filter((p) => p.amount > 0);
  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
  const description = String(formData.get("description") ?? "").trim();
  const invoiceNumber = emptyToNull(formData.get("invoice_number"));
  const category = emptyToNull(formData.get("category")) as ExpenseCategory | null;
  const notes = emptyToNull(formData.get("notes"));
  const isWarranty = formData.get("is_warranty") === "on";
  const paidBy = String(formData.get("paid_by") ?? "crew") as PaidByType;
  const approvedFields = status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {};
  const proofPaths = payments.map((p) => p.proof_path).filter((p): p is string => Boolean(p));

  const { data: header, error } = await supabase
    .from("expenses")
    .insert({
      boat_id: boatId,
      description,
      invoice_number: invoiceNumber,
      // Cosmetic only while in progress (never trusted for balance/report
      // math, which reads real payment rows directly) - kept in sync for
      // real once finishExpensePlan runs below.
      amount: round2(payments.reduce((s, p) => s + p.amount, 0)),
      category,
      payment_method: null,
      paid_by: paidBy,
      expense_date: null,
      notes,
      is_warranty: isWarranty,
      is_payment_plan: true,
      status,
      created_by: profile.id,
      ...approvedFields,
    })
    .select("id")
    .single();

  if (error) {
    if (proofPaths.length) await supabase.storage.from("receipts").remove(proofPaths);
    throw new Error(error.message);
  }

  if (payments.length > 0) {
    const { error: paymentsError } = await supabase.from("expenses").insert(
      payments.map((p) => ({
        boat_id: boatId,
        parent_expense_id: header.id,
        description,
        invoice_number: invoiceNumber,
        amount: p.amount,
        category,
        payment_method: p.payment_method,
        paid_by: paidBy,
        expense_date: p.expense_date,
        receipt_path: p.proof_path,
        notes,
        is_warranty: isWarranty,
        is_payment_plan: false,
        status,
        created_by: profile.id,
        ...approvedFields,
      }))
    );
    if (paymentsError) {
      if (proofPaths.length) await supabase.storage.from("receipts").remove(proofPaths);
      await supabase.from("expenses").delete().eq("id", header.id);
      throw new Error(paymentsError.message);
    }
  }

  if (status === "pending") {
    await notifyExpensePending(supabase, boatId, description);
  }

  revalidateAll(boatId);
}

// Adds one more payment to an already-saved, still-in-progress plan
// (reopened from the in-progress-plans list) - copies the plan's shared
// fields from its header row rather than asking for them again.
export async function addExpensePlanPayment(boatId: string, parentExpenseId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: header, error: headerError } = await supabase
    .from("expenses")
    .select("description, invoice_number, category, notes, is_warranty, paid_by")
    .eq("id", parentExpenseId)
    .single();
  if (headerError || !header) throw new Error(headerError?.message ?? "Payment plan not found");

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
  const amount = Number(formData.get("payment_amount") ?? 0);
  const paymentMethod = emptyToNull(formData.get("payment_payment_method")) as PaymentMethod | null;
  const expenseDate = emptyToNull(formData.get("payment_expense_date")) ?? todayLocalISO();
  const proofPath = emptyToNull(formData.get("payment_proof_path"));

  const { error } = await supabase.from("expenses").insert({
    boat_id: boatId,
    parent_expense_id: parentExpenseId,
    description: header.description,
    invoice_number: header.invoice_number,
    amount,
    category: header.category,
    payment_method: paymentMethod,
    paid_by: header.paid_by,
    expense_date: expenseDate,
    receipt_path: proofPath,
    notes: header.notes,
    is_warranty: header.is_warranty,
    is_payment_plan: false,
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) {
    if (proofPath) await supabase.storage.from("receipts").remove([proofPath]);
    throw new Error(error.message);
  }

  revalidateAll(boatId);
}

// Corrects one already-saved payment's amount/method/date/proof file - a
// plain per-field update rather than routing through updateExpense, since
// that function expects the full single-expense field set (description,
// category, notes, ...) and only ever backfills receipt_path when it was
// previously empty, which would silently block replacing an already-set
// proof file.
export async function updateExpensePlanPayment(boatId: string, paymentId: string, formData: FormData) {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("expenses")
    .select("receipt_path, expense_date")
    .eq("id", paymentId)
    .single();
  if (existingError || !existing) throw new Error(existingError?.message ?? "Payment not found");

  const amount = Number(formData.get("payment_amount") ?? 0);
  const paymentMethod = emptyToNull(formData.get("payment_payment_method")) as PaymentMethod | null;
  const expenseDate = emptyToNull(formData.get("payment_expense_date")) ?? existing.expense_date ?? todayLocalISO();
  const proofPath = emptyToNull(formData.get("payment_proof_path"));

  const { error } = await supabase
    .from("expenses")
    .update({
      amount,
      payment_method: paymentMethod,
      expense_date: expenseDate,
      ...(proofPath ? { receipt_path: proofPath } : {}),
    })
    .eq("id", paymentId);

  if (error) {
    if (proofPath) await supabase.storage.from("receipts").remove([proofPath]);
    throw new Error(error.message);
  }

  // A newly-attached proof file replaces (rather than joins) the old one -
  // the old file is now unreferenced, so it's swept from storage too.
  if (proofPath && existing.receipt_path && existing.receipt_path !== proofPath) {
    await supabase.storage.from("receipts").remove([existing.receipt_path]);
  }

  revalidateAll(boatId);
}

// Rolls every payment already recorded under a plan into its header row -
// sum, the shared payment method if every payment used the same one (else
// left null, meaning "paid via multiple methods" - see expenses-manager.tsx
// for how that renders). Also copies one payment's own receipt/photo onto
// the header, since finance/invoices/page.tsx (and anything else reading
// the legacy receipt_path column directly) would otherwise never see a
// finished plan has a proof file at all.
// The header's own expense_date is only ever set to today the first time
// (when it's still null, i.e. actually finishing the plan) - once a plan is
// finished, calling this again (e.g. after editing/adding a payment via the
// main list's edit form, see expenses-manager.tsx's PaymentPlanEditForm)
// must recompute the rolled-up totals without silently moving the
// already-recorded completion date to today.
export async function finishExpensePlan(boatId: string, parentExpenseId: string) {
  const supabase = await createClient();

  const { data: header, error: headerError } = await supabase
    .from("expenses")
    .select("expense_date")
    .eq("id", parentExpenseId)
    .single();
  if (headerError) throw new Error(headerError.message);

  const { data: payments, error: fetchError } = await supabase
    .from("expenses")
    .select("amount, payment_method, receipt_path, photo_path")
    .eq("parent_expense_id", parentExpenseId);
  if (fetchError) throw new Error(fetchError.message);
  if (!payments || payments.length === 0) {
    const { t } = await getTranslator();
    throw new Error(t("error_payment_plan_needs_payment"));
  }

  const amount = round2(payments.reduce((s, p) => s + p.amount, 0));
  const firstMethod = payments[0].payment_method;
  const payment_method = payments.every((p) => p.payment_method === firstMethod) ? firstMethod : null;
  const withReceipt = payments.find((p) => p.receipt_path);
  const withPhoto = payments.find((p) => p.photo_path);

  const { error } = await supabase
    .from("expenses")
    .update({
      amount,
      payment_method,
      expense_date: header?.expense_date ?? todayLocalISO(),
      receipt_path: withReceipt?.receipt_path ?? null,
      photo_path: withPhoto?.photo_path ?? null,
    })
    .eq("id", parentExpenseId);
  if (error) throw new Error(error.message);

  revalidateAll(boatId);
  revalidatePath("/approvals");
}

// Edits a plan's shared, copied-onto-every-payment fields (description/
// category/invoice_number/notes/is_warranty) - never amount/payment_method/
// expense_date, which stay derived from the plan's own payments (see
// finishExpensePlan above) rather than being directly editable. Propagates
// the same fields onto every payment row too, since each one keeps its own
// copy from creation time (see createExpensePaymentPlan) and those copies -
// not the header's - are what balance/reconciliation/report queries read
// once a payment exists as its own real transaction.
export async function updateExpensePlanHeader(boatId: string, parentExpenseId: string, formData: FormData) {
  const supabase = await createClient();

  const shared = {
    description: String(formData.get("description") ?? "").trim(),
    invoice_number: emptyToNull(formData.get("invoice_number")),
    category: emptyToNull(formData.get("category")) as ExpenseCategory | null,
    notes: emptyToNull(formData.get("notes")),
    is_warranty: formData.get("is_warranty") === "on",
  };

  const { error } = await supabase.from("expenses").update(shared).eq("id", parentExpenseId);
  if (error) throw new Error(error.message);

  const { error: childError } = await supabase.from("expenses").update(shared).eq("parent_expense_id", parentExpenseId);
  if (childError) throw new Error(childError.message);

  revalidateAll(boatId);
  revalidatePath("/approvals");
}

// Reverts an already-finished plan back to "in progress" - clears the
// header's own expense_date/payment_method/receipt_path/photo_path back to
// the exact blank state createExpensePaymentPlan starts a brand-new plan
// in, which is what keeps it out of every date-filtered balance/report/
// budget/invoices query and puts it back in the in-progress-plans panel
// instead of the main completed list. The payment rows underneath are
// untouched - they're already real transactions on their own dates,
// unaffected by whether the plan itself is marked finished.
export async function reopenExpensePlan(boatId: string, parentExpenseId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update({ expense_date: null, payment_method: null, receipt_path: null, photo_path: null })
    .eq("id", parentExpenseId);
  if (error) throw new Error(error.message);

  revalidateAll(boatId);
  revalidatePath("/approvals");
}

// Deleting a plan's header cascades its payment rows (and their
// expense_attachments) at the DB level (on delete cascade,
// 0072_expense_payment_plans.sql), but that only removes rows, not the
// Storage files they reference - every payment's + the header's own
// receipt/photo, plus any expense_attachments file, is collected first and
// swept from Storage after the delete. Used for a captain deleting their
// own not-yet-finished plan and for management rejecting one in approvals.
export async function deleteExpensePaymentPlan(boatId: string, parentExpenseId: string) {
  const supabase = await createClient();

  const { data: header } = await supabase
    .from("expenses")
    .select("receipt_path, photo_path")
    .eq("id", parentExpenseId)
    .single();
  const { data: payments } = await supabase
    .from("expenses")
    .select("id, receipt_path, photo_path")
    .eq("parent_expense_id", parentExpenseId);

  const expenseIds = [parentExpenseId, ...(payments ?? []).map((p) => p.id)];
  const { data: attachments } = await supabase
    .from("expense_attachments")
    .select("file_path")
    .in("expense_id", expenseIds);

  const { error } = await supabase.from("expenses").delete().eq("id", parentExpenseId);
  if (error) throw new Error(error.message);

  const toRemove = [
    header?.receipt_path,
    header?.photo_path,
    ...(payments ?? []).flatMap((p) => [p.receipt_path, p.photo_path]),
    ...(attachments ?? []).map((a) => a.file_path),
  ].filter((p): p is string => Boolean(p));
  if (toRemove.length) await supabase.storage.from("receipts").remove(toRemove);

  revalidateAll(boatId);
  revalidatePath("/approvals");
}

export async function removeExpenseAttachment(boatId: string, attachmentId: string, filePath: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("expense_attachments").delete().eq("id", attachmentId);
  if (error) throw new Error(error.message);

  await supabase.storage.from("receipts").remove([filePath]);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath("/approvals");
}

// One-click "swap in the date the bank statement suggests" from the
// reconciliation quick-fix icon - touches only expense_date, leaving
// every other field (amount included) exactly as it was.
export async function updateExpenseDateOnly(boatId: string, expenseId: string, newDate: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").update({ expense_date: newDate }).eq("id", expenseId);
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/finance/bank-reconciliation`);
  revalidateAll(boatId);
}

export async function removeExpenseReceipt(boatId: string, expenseId: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase.from("expenses").select("receipt_path").eq("id", expenseId).single();
  const { error } = await supabase.from("expenses").update({ receipt_path: null }).eq("id", expenseId);
  if (error) throw new Error(error.message);

  if (existing?.receipt_path) await supabase.storage.from("receipts").remove([existing.receipt_path]);

  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath("/approvals");
}

export async function removeExpensePhoto(boatId: string, expenseId: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase.from("expenses").select("photo_path").eq("id", expenseId).single();
  const { error } = await supabase.from("expenses").update({ photo_path: null }).eq("id", expenseId);
  if (error) throw new Error(error.message);

  if (existing?.photo_path) await supabase.storage.from("receipts").remove([existing.photo_path]);

  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath("/approvals");
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
  revalidateAll(boatId);
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
  revalidateAll(boatId);
}

// Approves several pending expenses in one request, from the multi-select
// panel on the approvals page - the approvals page is fleet-wide (every
// boat management oversees), so a selection can span more than one boat;
// every boat actually affected gets its own revalidation, same as a single
// approveExpense call would for its one boat.
export async function bulkApproveExpenses(expenseIds: string[]) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }
  if (expenseIds.length === 0) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .in("id", expenseIds)
    .select("boat_id");

  if (error) throw new Error(error.message);

  const boatIds = [...new Set((data ?? []).map((e) => e.boat_id))];
  for (const boatId of boatIds) revalidateAll(boatId);
  revalidatePath("/approvals");
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
      category: emptyToNull(formData.get("category")) as ExpenseCategory | null,
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
  revalidateAll(boatId);
}
