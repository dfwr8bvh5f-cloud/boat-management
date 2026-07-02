"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export async function setBankBalance(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    throw new Error("רק תפקיד ניהול יכול לעדכן את מצב החשבון");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_balances")
    .upsert({ boat_id: boatId, balance: Number(formData.get("balance") ?? 0), updated_at: new Date().toISOString() });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/bank`);
}
