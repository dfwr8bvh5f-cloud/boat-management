"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import { round2 } from "@/lib/money";
import { getTranslator } from "@/lib/i18n/locale";
import type { ExpenseCategory } from "@/lib/types/database";

export async function setCategoryBudget(boatId: string, category: ExpenseCategory, formData: FormData) {
  await requireManagement("error_management_only_budget");
  const supabase = await createClient();

  const { error } = await supabase
    .from("budget_categories")
    .upsert({ boat_id: boatId, category, amount: Number(formData.get("amount") ?? 0) });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/budget`);
}

// Name + amount fields shared by add and edit. `mode` ("fixed" | "rate") is
// sent by the budget page's form; when it is absent (older callers) the
// original rule applies: rate x duration wins if both are filled in.
async function parseSubcategoryForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    const { t } = await getTranslator();
    throw new Error(t("error_subcat_name_required"));
  }

  const mode = formData.get("mode");
  const useRate = mode === "fixed" ? false : numberOrNull(formData.get("rate")) != null && numberOrNull(formData.get("duration")) != null;
  if (mode === "rate" && !useRate) {
    const { t } = await getTranslator();
    throw new Error(t("error_subcat_rate_required"));
  }

  if (useRate) {
    const rate = numberOrNull(formData.get("rate"));
    const duration = numberOrNull(formData.get("duration"));
    return {
      name,
      amount: round2((rate as number) * (duration as number)),
      rate,
      duration,
      duration_unit: emptyToNull(formData.get("duration_unit")),
    };
  }
  // Fixed amount: rate/duration/unit are explicitly cleared so an edit that
  // switches a line from rate x quantity to a flat amount doesn't leave a
  // stale "(rate x qty)" label next to the new total.
  return { name, amount: numberOrNull(formData.get("amount")) ?? 0, rate: null, duration: null, duration_unit: null };
}

export async function addBudgetSubcategory(boatId: string, category: ExpenseCategory, formData: FormData) {
  await requireManagement("error_management_only_budget");
  const supabase = await createClient();
  const fields = await parseSubcategoryForm(formData);

  const { error } = await supabase.from("budget_subcategories").insert({ boat_id: boatId, category, ...fields });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/budget`);
}

// Edits the existing row in place (same id), so nothing that points at it is
// disturbed. Expenses don't reference budget_subcategories at all (they only
// carry a category), so spend history and attribution are unaffected by an
// edit or a delete - only the planned totals change.
export async function updateBudgetSubcategory(boatId: string, subcategoryId: string, formData: FormData) {
  await requireManagement("error_management_only_budget");
  const supabase = await createClient();
  const fields = await parseSubcategoryForm(formData);

  const { error } = await supabase
    .from("budget_subcategories")
    .update(fields)
    .eq("id", subcategoryId)
    .eq("boat_id", boatId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/budget`);
}

export async function removeBudgetSubcategory(boatId: string, subcategoryId: string) {
  await requireManagement("error_management_only_budget");
  const supabase = await createClient();

  const { error } = await supabase.from("budget_subcategories").delete().eq("id", subcategoryId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/budget`);
}
