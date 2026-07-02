"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type { ApprovalStatus, CashTxType } from "@/lib/types/database";

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
    tx_date: String(formData.get("tx_date") ?? new Date().toISOString().slice(0, 10)),
    notes: emptyToNull(formData.get("notes")),
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) throw new Error(error.message);

  // A cash withdrawal comes out of the bank balance automatically. Captain
  // can't write bank_balances directly, so this goes through a
  // security-definer RPC scoped to exactly this coupled operation.
  if (type === "withdrawal") {
    const { error: rpcError } = await supabase.rpc("apply_cash_withdrawal", {
      p_boat_id: boatId,
      p_amount: amount,
    });
    if (rpcError) throw new Error(rpcError.message);
  }

  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
}

export async function deleteCashTransaction(boatId: string, cashId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("cash_transactions").delete().eq("id", cashId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/cash`);
}

export async function approveCashTransaction(boatId: string, cashId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    throw new Error("רק תפקיד ניהול יכול לאשר רשומות");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_transactions")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", cashId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/cash`);
}
