"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/locale";

export async function setBankBalance(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_bank_update"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_balances")
    .upsert({ boat_id: boatId, balance: Number(formData.get("balance") ?? 0), updated_at: new Date().toISOString() });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/bank`);
}
