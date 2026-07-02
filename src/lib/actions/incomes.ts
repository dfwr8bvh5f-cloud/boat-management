"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { ApprovalStatus, IncomeType } from "@/lib/types/database";

export async function createIncome(boatId: string, type: IncomeType, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { error } = await supabase.from("incomes").insert({
    boat_id: boatId,
    source: String(formData.get("source") ?? "").trim(),
    amount: Number(formData.get("amount") ?? 0),
    income_date: String(formData.get("income_date") ?? new Date().toISOString().slice(0, 10)),
    type,
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/future`);
}

export async function deleteIncome(boatId: string, incomeId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("incomes").delete().eq("id", incomeId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/future`);
}

export async function approveIncome(boatId: string, incomeId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    throw new Error("רק תפקיד ניהול יכול לאשר רשומות");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("incomes")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", incomeId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/future`);
}
