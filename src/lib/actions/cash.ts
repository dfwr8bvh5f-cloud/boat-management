"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, emptyToUndefined } from "@/lib/form-utils";
import type { ApprovalStatus, CashTxType } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";

// The set of pages that show a cash transaction's amount/status, revalidated
// together after any mutation that can change it - mirrors the identical
// helper already in bank-statement.ts and expenses.ts.
function revalidateAll(boatId: string) {
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

export async function createCashTransaction(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
  const type = String(formData.get("type") ?? "withdrawal") as CashTxType;
  const amount = Number(formData.get("amount") ?? 0);
  // Left empty in the UI on purpose (no default date pushed on the user) -
  // omitting the key lets the column's own `default current_date` apply.
  const txDate = emptyToUndefined(formData.get("tx_date"));

  const { error } = await supabase.from("cash_transactions").insert({
    boat_id: boatId,
    type,
    amount,
    ...(txDate ? { tx_date: txDate } : {}),
    notes: emptyToNull(formData.get("notes")),
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) throw new Error(error.message);

  revalidateAll(boatId);
}

export async function updateCashTransaction(boatId: string, cashId: string, formData: FormData) {
  const supabase = await createClient();

  const txDate = emptyToUndefined(formData.get("tx_date"));

  const { error } = await supabase
    .from("cash_transactions")
    .update({
      type: String(formData.get("type") ?? "withdrawal") as CashTxType,
      amount: Number(formData.get("amount") ?? 0),
      ...(txDate ? { tx_date: txDate } : {}),
      notes: emptyToNull(formData.get("notes")),
    })
    .eq("id", cashId);

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function deleteCashTransaction(boatId: string, cashId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("cash_transactions").delete().eq("id", cashId);
  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function approveCashTransaction(boatId: string, cashId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_transactions")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", cashId);

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}
