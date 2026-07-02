"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";
import type { ExpenseCategory } from "@/lib/types/database";

async function assertManagement() {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_budget"));
  }
}

export async function setCategoryBudget(boatId: string, category: ExpenseCategory, formData: FormData) {
  await assertManagement();
  const supabase = await createClient();

  const { error } = await supabase
    .from("budget_categories")
    .upsert({ boat_id: boatId, category, amount: Number(formData.get("amount") ?? 0) });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/budget`);
}

export async function addBudgetSubcategory(boatId: string, category: ExpenseCategory, formData: FormData) {
  await assertManagement();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    const { t } = await getTranslator();
    throw new Error(t("error_subcat_name_required"));
  }

  const rate = numberOrNull(formData.get("rate"));
  const duration = numberOrNull(formData.get("duration"));
  const duration_unit = emptyToNull(formData.get("duration_unit"));
  const manualAmount = numberOrNull(formData.get("amount"));
  const amount = rate != null && duration != null ? rate * duration : (manualAmount ?? 0);

  const { error } = await supabase.from("budget_subcategories").insert({
    boat_id: boatId,
    category,
    name,
    amount,
    rate,
    duration,
    duration_unit,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/budget`);
}

export async function removeBudgetSubcategory(boatId: string, subcategoryId: string) {
  await assertManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("budget_subcategories").delete().eq("id", subcategoryId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/budget`);
}
