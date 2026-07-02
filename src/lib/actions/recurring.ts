"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { ApprovalStatus, ExpenseCategory, PaymentMethod } from "@/lib/types/database";

export async function createRecurringExpense(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("recurring_expenses").insert({
    boat_id: boatId,
    description: String(formData.get("description") ?? "").trim(),
    amount: Number(formData.get("amount") ?? 0),
    category: (String(formData.get("category") ?? "other") as ExpenseCategory),
    payment_method: (String(formData.get("payment_method") ?? "other") as PaymentMethod),
    day_of_month: Number(formData.get("day_of_month") ?? 1),
    created_by: profile.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/recurring`);
}

export async function deleteRecurringExpense(boatId: string, recurringId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_expenses").delete().eq("id", recurringId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/recurring`);
}

export async function confirmRecurringPayment(boatId: string, recurringId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: recurring } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("id", recurringId)
    .single();
  if (!recurring) throw new Error("ההוצאה הקבועה לא נמצאה");

  const month = String(formData.get("month") ?? new Date().toISOString().slice(0, 7));
  const amount = Number(formData.get("amount") || recurring.amount);
  const liters = formData.get("liters") ? Number(formData.get("liters")) : null;
  const day = String(recurring.day_of_month).padStart(2, "0");

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { error: insertError } = await supabase.from("expenses").insert({
    boat_id: boatId,
    description: recurring.description + (liters ? ` — ${liters} ליטר` : ""),
    amount,
    category: recurring.category,
    payment_method: recurring.payment_method,
    paid_by: "management",
    expense_date: `${month}-${day}`,
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });
  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await supabase
    .from("recurring_expenses")
    .update({ last_paid_month: month })
    .eq("id", recurringId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/boats/${boatId}/finance/recurring`);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
}
