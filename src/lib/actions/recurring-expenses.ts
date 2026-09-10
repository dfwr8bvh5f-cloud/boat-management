"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import { addMonthsClampedISO } from "@/lib/date-format";
import { notifyExpensePending, revalidateAll } from "@/lib/actions/expenses";
import type { ApprovalStatus, ExpenseCategory, PaidByType, PaymentMethod } from "@/lib/types/database";

// A recurring template's own shared fields (everything except scheduling
// and active state) - reused by both updateRecurringExpenseTemplate and
// confirmRecurringExpense's read of the edited-before-adding form.
function readTemplateFields(formData: FormData) {
  return {
    description: String(formData.get("description") ?? "").trim(),
    invoice_number: emptyToNull(formData.get("invoice_number")),
    amount: Number(formData.get("amount") ?? 0),
    category: emptyToNull(formData.get("category")) as ExpenseCategory | null,
    payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
    paid_by: (String(formData.get("paid_by") ?? "crew") as PaidByType),
    is_warranty: formData.get("is_warranty") === "on",
    notes: emptyToNull(formData.get("notes")),
  };
}

// Edits a template's shared fields plus its schedule (next_due_date, and
// the day_of_month derived from it) - used from the "manage recurring
// expenses" list, not from the due-suggestion banner (see
// confirmRecurringExpense below for that path).
export async function updateRecurringExpenseTemplate(boatId: string, templateId: string, formData: FormData) {
  await requireProfile();
  const supabase = await createClient();

  const nextDueDate = emptyToNull(formData.get("next_due_date"));
  if (!nextDueDate) throw new Error("Missing next due date");
  const dayOfMonth = Number(nextDueDate.split("-")[2]);

  const { error } = await supabase
    .from("expense_recurring_templates")
    .update({ ...readTemplateFields(formData), day_of_month: dayOfMonth, next_due_date: nextDueDate })
    .eq("id", templateId);
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/finance/expenses`);
}

// Stops (or resumes) a template's monthly suggestion - "stop" never deletes
// past expenses already confirmed from it, and never deletes the template
// itself, so it can still be resumed later from the manage-recurring list.
export async function setRecurringExpenseTemplateActive(boatId: string, templateId: string, active: boolean) {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("expense_recurring_templates").update({ active }).eq("id", templateId);
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/finance/expenses`);
}

// Removes a template entirely (e.g. it was set up by mistake) - any
// already-confirmed expense keeps existing, just loses its
// recurring_template_id link (on delete set null, see
// 0075_recurring_expenses.sql).
export async function deleteRecurringExpenseTemplate(boatId: string, templateId: string) {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("expense_recurring_templates").delete().eq("id", templateId);
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/finance/expenses`);
}

// Confirms this month's due occurrence: creates a real expense from the
// (possibly edited) suggested fields, exactly like createExpense does for a
// normal one-off entry, then advances the template's next_due_date by one
// month from its fixed day_of_month - independent of whether she confirms
// exactly on the due day or a few days late. Never fires on its own; this
// only ever runs from an explicit confirm click on the due-suggestion
// banner (see recurring-expenses-panel.tsx).
export async function confirmRecurringExpense(boatId: string, templateId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: template, error: templateError } = await supabase
    .from("expense_recurring_templates")
    .select("day_of_month, next_due_date")
    .eq("id", templateId)
    .single();
  if (templateError || !template) throw new Error(templateError?.message ?? "Recurring template not found");

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
  const fields = readTemplateFields(formData);

  const { error } = await supabase.from("expenses").insert({
    boat_id: boatId,
    recurring_template_id: templateId,
    ...fields,
    expense_date: emptyToNull(formData.get("expense_date")),
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });
  if (error) throw new Error(error.message);

  const nextDueDate = addMonthsClampedISO(template.next_due_date, 1, template.day_of_month);
  const { error: advanceError } = await supabase
    .from("expense_recurring_templates")
    .update({ next_due_date: nextDueDate })
    .eq("id", templateId);
  if (advanceError) throw new Error(advanceError.message);

  if (status === "pending") {
    await notifyExpensePending(supabase, boatId, fields.description);
  }

  revalidateAll(boatId);
}
