"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { emptyToNull, emptyToUndefined } from "@/lib/form-utils";
import { round2 } from "@/lib/money";
import { todayLocalISO } from "@/lib/date-format";
import type { PaymentMethod } from "@/lib/types/database";

// Every action here re-asserts management itself via requireManagement
// rather than trusting the page gate alone, same defense-in-depth every
// other MYS server action already has (see src/lib/actions/mys.ts).
function revalidateCommissions() {
  revalidatePath("/mys");
  revalidatePath("/mys/commissions");
  revalidatePath("/mys/debts");
}

// Signed upload URL for a supplier invoice file - same direct-to-storage
// pattern as createMysExpenseUploadUrl (src/lib/actions/mys.ts), same
// shared "receipts" bucket under the "mys/" prefix.
export async function createMysSupplierUploadUrl(fileName: string) {
  await requireManagement();
  const supabase = await createClient();
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const storagePath = `mys/${Date.now()}_${safeName}`;
  const { data, error } = await supabase.storage.from("receipts").createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);
  return { path: storagePath, token: data.token };
}

// A small, name-only pick list feeding the "supplier" field's dropdown -
// same role as createMysClient (src/lib/actions/mys.ts).
export async function createMysSupplier(formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Supplier name is required");

  const { error } = await supabase.from("mys_suppliers").insert({ name });
  if (error) throw new Error(error.message);

  revalidatePath("/mys/commissions");
}

// Shared by createMysSupplierCommission/updateMysSupplierCommission:
// commission_percent/commission_amount are always both derived here and
// written together, never trusted as an already-agreeing pair from the
// client - same rule readMysExpenseFields already applies to
// markup_percent/client_price. "mode" says which one she actually typed;
// the other is computed from it. vat_amount/total_amount follow the same
// never-trust-the-client rule.
function computeCommissionFields(formData: FormData) {
  const invoiceAmount = Number(formData.get("invoice_amount") ?? 0);
  const mode = String(formData.get("pricing_mode") ?? "percent");

  let commissionPercent: number;
  let commissionAmount: number;
  if (mode === "amount") {
    commissionAmount = Number(formData.get("commission_amount") ?? 0);
    commissionPercent = invoiceAmount > 0 ? round2((commissionAmount / invoiceAmount) * 100) : 0;
  } else {
    commissionPercent = Number(formData.get("commission_percent") ?? 0);
    commissionAmount = round2(invoiceAmount * (commissionPercent / 100));
  }

  const vatPercentRaw = emptyToNull(formData.get("vat_percent"));
  const vatPercent = vatPercentRaw != null ? Number(vatPercentRaw) : null;
  const vatAmount = vatPercent != null ? round2(commissionAmount * (vatPercent / 100)) : 0;
  const totalAmount = round2(commissionAmount + vatAmount);

  return {
    supplier_name: String(formData.get("supplier_name") ?? "").trim(),
    invoice_date: emptyToNull(formData.get("invoice_date")),
    invoice_amount: invoiceAmount,
    commission_percent: commissionPercent,
    commission_amount: commissionAmount,
    vat_percent: vatPercent,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    notes: emptyToNull(formData.get("notes")),
  };
}

async function insertCommissionAttachments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  commissionId: string,
  paths: string[],
  createdBy: string | null
) {
  if (paths.length === 0) return;
  const { error } = await supabase
    .from("mys_supplier_commission_attachments")
    .insert(paths.map((file_path) => ({ commission_id: commissionId, file_path, created_by: createdBy })));
  if (error) {
    await supabase.storage.from("receipts").remove(paths);
    throw new Error(error.message);
  }
}

// Creates straight into 'unpaid' - she asked to drop the separate
// preview/approve step (originally a two-step draft->approve flow, same
// shape as createMysInvoice/markMysInvoiceSent), so a new commission shows
// up on /mys/debts immediately instead of needing an explicit
// approveMysSupplierCommission click first. That action (and the 'draft'
// status/UI) stays in place for any already-existing draft row.
export async function createMysSupplierCommission(formData: FormData) {
  const profile = await requireManagement();
  const supabase = await createClient();

  const fields = computeCommissionFields(formData);
  const paths = formData.getAll("attachment_paths").filter((v): v is string => typeof v === "string" && v.length > 0);
  const commissionInvoicePath = emptyToNull(formData.get("commission_invoice_path"));

  const { data: inserted, error } = await supabase
    .from("mys_supplier_commissions")
    .insert({ ...fields, status: "unpaid", commission_invoice_path: commissionInvoicePath, created_by: profile.id })
    .select("id")
    .single();

  if (error || !inserted) {
    if (paths.length > 0) await supabase.storage.from("receipts").remove(paths);
    if (commissionInvoicePath) await supabase.storage.from("receipts").remove([commissionInvoicePath]);
    throw new Error(error?.message ?? "Failed to create commission");
  }

  await insertCommissionAttachments(supabase, inserted.id, paths, profile.id);

  revalidateCommissions();
}

// Editing stays open for a draft or an already-approved-but-still-unpaid
// commission (she may need to correct a typo before it's settled) -
// refused once paid, since the amount then represents money already
// reconciled as received. Returned, not thrown - this app's production
// build redacts a thrown Server Action error's message (see
// deleteMysExpense's comment in mys.ts for the full explanation).
export async function updateMysSupplierCommission(
  commissionId: string,
  formData: FormData
): Promise<{ error: string } | undefined> {
  const profile = await requireManagement();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("mys_supplier_commissions")
    .select("status, commission_invoice_path")
    .eq("id", commissionId)
    .single();
  if (existing?.status === "paid") {
    return { error: "This commission has already been marked paid and can't be edited" };
  }

  const fields = computeCommissionFields(formData);
  const newPaths = formData.getAll("attachment_paths").filter((v): v is string => typeof v === "string" && v.length > 0);
  // The invoice she herself issues to the supplier for this commission -
  // distinct from attachment_paths above (the supplier's own invoice(s)).
  // Omit the field entirely to leave it untouched; pass an empty string to
  // remove it, or a new path to replace it - same convention
  // updateMysIncome's invoice_path already uses.
  const commissionInvoicePath = formData.has("commission_invoice_path")
    ? emptyToNull(formData.get("commission_invoice_path"))
    : (existing?.commission_invoice_path ?? null);

  const { error } = await supabase
    .from("mys_supplier_commissions")
    .update({ ...fields, commission_invoice_path: commissionInvoicePath })
    .eq("id", commissionId);
  if (error) throw new Error(error.message);

  if (existing?.commission_invoice_path && existing.commission_invoice_path !== commissionInvoicePath) {
    await supabase.storage.from("receipts").remove([existing.commission_invoice_path]);
  }

  await insertCommissionAttachments(supabase, commissionId, newPaths, profile.id);

  revalidateCommissions();
}

// Moves a draft onto /mys/debts as an open receivable - see the table
// comment in 0091_mys_supplier_commissions.sql for the full lifecycle.
export async function approveMysSupplierCommission(commissionId: string): Promise<{ error: string } | undefined> {
  await requireManagement();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("mys_supplier_commissions").select("status").eq("id", commissionId).single();
  if (existing?.status !== "draft") {
    return { error: "Only a draft commission can be approved" };
  }

  const { error } = await supabase.from("mys_supplier_commissions").update({ status: "unpaid" }).eq("id", commissionId);
  if (error) throw new Error(error.message);

  revalidateCommissions();
}

// Records a (possibly partial) payment against a commission - mirrors
// addMysInvoicePayment/addMysDebtSettlement's own partial-payment pattern
// (mys_commission_payments, 0101_mys_commission_payments.sql). status stays
// 'unpaid' (showing only the remaining balance on /mys/debts) while
// sum(payments) < total_amount, and flips to 'paid' the moment a payment
// brings the sum up to (or past) that total. Every payment auto-records its
// own mys_income row (partial or full), mirroring what addMysDebtSettlement
// already does for the other debt kinds. linkedIncomeId mirrors
// addMysInvoicePayment/addMysDebtSettlement's own param - passed only by
// linkMysIncomeToDebt, which already inserted its own income row for this
// exact payment, so this skips creating a second, duplicate one.
export async function addMysSupplierCommissionPayment(
  commissionId: string,
  formData: FormData,
  linkedIncomeId?: string
): Promise<{ error: string } | undefined> {
  const profile = await requireManagement();
  const supabase = await createClient();

  const amount = Number(formData.get("amount") ?? 0);
  // Returned, not thrown - see deleteMysExpense's comment in mys.ts for why.
  if (amount <= 0) return { error: "Payment amount must be greater than zero" };
  const paidDate = emptyToUndefined(formData.get("paid_date")) ?? todayLocalISO();
  const paymentMethod = emptyToNull(formData.get("payment_method")) as PaymentMethod | null;

  const { data: payment, error: insertError } = await supabase
    .from("mys_commission_payments")
    .insert({ commission_id: commissionId, amount, paid_date: paidDate, payment_method: paymentMethod, created_by: profile.id })
    .select("id, paid_date")
    .single();
  if (insertError || !payment) throw new Error(insertError?.message ?? "Failed to record payment");

  const [{ data: commission }, { data: payments }] = await Promise.all([
    supabase
      .from("mys_supplier_commissions")
      .select("supplier_name, notes, total_amount, status, commission_invoice_path")
      .eq("id", commissionId)
      .single(),
    supabase.from("mys_commission_payments").select("amount, paid_date").eq("commission_id", commissionId),
  ]);
  if (!commission) throw new Error("Commission not found");

  const totalPaid = round2((payments ?? []).reduce((s, p) => s + p.amount, 0));
  const isFullyPaid = totalPaid >= round2(commission.total_amount);
  if (isFullyPaid && commission.status !== "paid") {
    const latestPaidDate = (payments ?? []).reduce((max, p) => (p.paid_date > max ? p.paid_date : max), payment.paid_date);
    const { error: statusError } = await supabase
      .from("mys_supplier_commissions")
      .update({ status: "paid", paid_date: latestPaidDate })
      .eq("id", commissionId);
    if (statusError) throw new Error(statusError.message);
  }

  if (linkedIncomeId) {
    await supabase.from("mys_commission_payments").update({ mys_income_id: linkedIncomeId }).eq("id", payment.id);
    revalidatePath("/mys/income");
  } else {
    const { data: income, error: incomeError } = await supabase
      .from("mys_income")
      .insert({
        description: commission.notes || commission.supplier_name,
        amount,
        income_date: payment.paid_date,
        client_name: commission.supplier_name,
        payment_method: paymentMethod,
        invoice_path: commission.commission_invoice_path,
        invoice_issued: commission.commission_invoice_path != null,
        linked_commission_id: commissionId,
      })
      .select("id")
      .single();
    if (incomeError || !income) {
      console.error("addMysSupplierCommissionPayment: failed to auto-record income", incomeError);
    } else {
      await supabase.from("mys_commission_payments").update({ mys_income_id: income.id }).eq("id", payment.id);
      revalidatePath("/mys/income");
    }
  }

  revalidateCommissions();
}

export async function deleteMysSupplierCommission(commissionId: string) {
  await requireManagement();
  const supabase = await createClient();

  const [{ data: attachments }, { data: existing }] = await Promise.all([
    supabase.from("mys_supplier_commission_attachments").select("file_path").eq("commission_id", commissionId),
    supabase.from("mys_supplier_commissions").select("commission_invoice_path").eq("id", commissionId).single(),
  ]);

  const { error } = await supabase.from("mys_supplier_commissions").delete().eq("id", commissionId);
  if (error) throw new Error(error.message);

  const paths = (attachments ?? []).map((a) => a.file_path);
  if (existing?.commission_invoice_path) paths.push(existing.commission_invoice_path);
  if (paths.length > 0) await supabase.storage.from("receipts").remove(paths);

  revalidateCommissions();
}

export async function removeMysSupplierCommissionAttachment(attachmentId: string, filePath: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_supplier_commission_attachments").delete().eq("id", attachmentId);
  if (error) throw new Error(error.message);

  await supabase.storage.from("receipts").remove([filePath]);

  revalidateCommissions();
}
