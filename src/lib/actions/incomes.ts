"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToUndefined } from "@/lib/form-utils";
import type { ApprovalStatus, IncomeType } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";

// The set of pages that show an income's amount/status, revalidated
// together after any mutation that can change it - mirrors the identical
// helper already in bank-statement.ts, expenses.ts, and cash.ts.
function revalidateAll(boatId: string) {
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/future`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

export async function createIncome(boatId: string, type: IncomeType, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
  // Left empty in the UI on purpose (no default date pushed on the user) -
  // omitting the key lets the column's own `default current_date` apply.
  const incomeDate = emptyToUndefined(formData.get("income_date"));

  const { error } = await supabase.from("incomes").insert({
    boat_id: boatId,
    source: String(formData.get("source") ?? "").trim(),
    amount: Number(formData.get("amount") ?? 0),
    ...(incomeDate ? { income_date: incomeDate } : {}),
    type,
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function updateIncome(boatId: string, incomeId: string, formData: FormData) {
  const supabase = await createClient();

  const incomeDate = emptyToUndefined(formData.get("income_date"));

  const { error } = await supabase
    .from("incomes")
    .update({
      source: String(formData.get("source") ?? "").trim(),
      amount: Number(formData.get("amount") ?? 0),
      ...(incomeDate ? { income_date: incomeDate } : {}),
    })
    .eq("id", incomeId);

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function deleteIncome(boatId: string, incomeId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("incomes").delete().eq("id", incomeId);
  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function approveIncome(boatId: string, incomeId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("incomes")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", incomeId);

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}
