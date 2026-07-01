"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { ExpenseCategory } from "@/lib/types/database";

async function assertManagement() {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    throw new Error("רק תפקיד ניהול יכול לערוך את התקציב");
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
  if (!name) throw new Error("יש להזין שם תת-קטגוריה");

  const { error } = await supabase.from("budget_subcategories").insert({
    boat_id: boatId,
    category,
    name,
    amount: Number(formData.get("amount") ?? 0),
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
