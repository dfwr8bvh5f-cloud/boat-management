"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import { todayLocalISO } from "@/lib/date-format";
import type { ApprovalStatus, CashTxType } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";

export async function createCashTransaction(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
  const type = String(formData.get("type") ?? "withdrawal") as CashTxType;
  const amount = Number(formData.get("amount") ?? 0);

  const { error } = await supabase.from("cash_transactions").insert({
    boat_id: boatId,
    type,
    amount,
    tx_date: String(formData.get("tx_date") ?? todayLocalISO()),
    notes: emptyToNull(formData.get("notes")),
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

export async function updateCashTransaction(boatId: string, cashId: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("cash_transactions")
    .update({
      type: String(formData.get("type") ?? "withdrawal") as CashTxType,
      amount: Number(formData.get("amount") ?? 0),
      tx_date: String(formData.get("tx_date") ?? todayLocalISO()),
      notes: emptyToNull(formData.get("notes")),
    })
    .eq("id", cashId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

export async function deleteCashTransaction(boatId: string, cashId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("cash_transactions").delete().eq("id", cashId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
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
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}
