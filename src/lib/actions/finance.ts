"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type { FinancialType } from "@/lib/types/database";

export async function createFinancialRecord(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("financial_records").insert({
    boat_id: boatId,
    type: (String(formData.get("type") ?? "expense") as FinancialType),
    category: emptyToNull(formData.get("category")),
    amount: Number(formData.get("amount") ?? 0),
    description: emptyToNull(formData.get("description")),
    record_date: String(formData.get("record_date") ?? new Date().toISOString().slice(0, 10)),
    created_by: profile.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance`);
}

export async function deleteFinancialRecord(boatId: string, recordId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("financial_records").delete().eq("id", recordId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance`);
}
