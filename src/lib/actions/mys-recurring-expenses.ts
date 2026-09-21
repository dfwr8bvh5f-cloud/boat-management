"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import { advanceRecurrence } from "@/lib/date-format";
import { readMysExpenseFields, mirrorBoatPaymentExpense } from "@/lib/actions/mys";
import { MYS_SUBCATEGORIES_BY_CATEGORY } from "@/lib/labels";
import type { MysExpenseCategory, PaymentMethod, RecurrenceFrequency } from "@/lib/types/database";

function revalidateAll() {
  revalidatePath("/mys");
  revalidatePath("/mys/expenses");
}

// A recurring template's own shared fields (everything except scheduling) -
// used by updateMysRecurringExpenseTemplate. Mirrors readMysExpenseFields
// (src/lib/actions/mys.ts) minus expense_date (that's the schedule, held
// separately as next_due_date) and client_price (a template never stores
// the derived price, only the markup_percent it's computed from at confirm
// time, same as mys_expenses itself never trusting a client-sent price).
function readMysTemplateFields(formData: FormData) {
  const category = emptyToNull(formData.get("category")) as MysExpenseCategory | null;
  const isBoatPayment = category === "boat_payment";

  return {
    category,
    subcategory: category && MYS_SUBCATEGORIES_BY_CATEGORY[category] ? emptyToNull(formData.get("subcategory")) : null,
    description: String(formData.get("description") ?? "").trim(),
    invoice_number: emptyToNull(formData.get("invoice_number")),
    amount: Number(formData.get("amount") ?? 0),
    payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
    client_name: isBoatPayment ? emptyToNull(formData.get("client_name")) : null,
    markup_percent: isBoatPayment ? Number(formData.get("markup_percent") ?? 0) || null : null,
    notes: emptyToNull(formData.get("notes")),
  };
}

// Edits a template's shared fields plus its schedule (frequency,
// next_due_date, the day_of_month derived from it, and the optional
// end_date) - used from the "manage recurring expenses" list, not from the
// due-suggestion banner (see confirmMysRecurringExpense below for that
// path).
export async function updateMysRecurringExpenseTemplate(templateId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const nextDueDate = emptyToNull(formData.get("next_due_date"));
  if (!nextDueDate) throw new Error("Missing next due date");
  const dayOfMonth = Number(nextDueDate.split("-")[2]);
  const frequency = (String(formData.get("frequency") ?? "monthly") as RecurrenceFrequency) || "monthly";
  const endDate = emptyToNull(formData.get("end_date"));

  const { error } = await supabase
    .from("mys_expense_recurring_templates")
    .update({ ...readMysTemplateFields(formData), frequency, day_of_month: dayOfMonth, next_due_date: nextDueDate, end_date: endDate })
    .eq("id", templateId);
  if (error) throw new Error(error.message);

  revalidatePath("/mys/expenses");
}

// Stops (or resumes) a template's monthly suggestion - "stop" never deletes
// past expenses already confirmed from it, and never deletes the template
// itself, so it can still be resumed later from the manage-recurring list.
export async function setMysRecurringExpenseTemplateActive(templateId: string, active: boolean) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_expense_recurring_templates").update({ active }).eq("id", templateId);
  if (error) throw new Error(error.message);

  revalidatePath("/mys/expenses");
}

// Removes a template entirely (e.g. it was set up by mistake) - any
// already-confirmed expense keeps existing, just loses its
// recurring_template_id link (on delete set null, see
// 0097_mys_expense_recurring_templates.sql).
export async function deleteMysRecurringExpenseTemplate(templateId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_expense_recurring_templates").delete().eq("id", templateId);
  if (error) throw new Error(error.message);

  revalidatePath("/mys/expenses");
}

// Confirms this occurrence: creates a real mys_expenses row from the
// (possibly edited) suggested fields, exactly like createMysExpense does
// for a normal one-off entry (same field reader, same boat_payment mirroring
// onto the matched boat/ad-hoc debt), then advances the template's
// next_due_date by its frequency from its fixed day_of_month - independent
// of whether she confirms exactly on the due day or a few days late. If
// that advance would land past the template's end_date, it auto-stops
// (active: false) instead of continuing to recur past the date she set.
// Never fires on its own; this only ever runs from an explicit confirm
// click on the due-suggestion banner (see mys-recurring-expenses-panel.tsx).
export async function confirmMysRecurringExpense(templateId: string, formData: FormData) {
  const profile = await requireManagement();
  const supabase = await createClient();

  const { data: template, error: templateError } = await supabase
    .from("mys_expense_recurring_templates")
    .select("frequency, day_of_month, next_due_date, end_date")
    .eq("id", templateId)
    .single();
  if (templateError || !template) throw new Error(templateError?.message ?? "Recurring template not found");

  const fields = await readMysExpenseFields(formData);

  const { data: inserted, error } = await supabase
    .from("mys_expenses")
    .insert({ ...fields, recurring_template_id: templateId })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "Failed to create expense");

  await mirrorBoatPaymentExpense(supabase, profile.id, inserted.id, fields, null);

  const nextDueDate = advanceRecurrence(template.next_due_date, template.frequency, template.day_of_month);
  const { error: advanceError } = await supabase
    .from("mys_expense_recurring_templates")
    .update({ next_due_date: nextDueDate, ...(template.end_date && nextDueDate > template.end_date ? { active: false } : {}) })
    .eq("id", templateId);
  if (advanceError) throw new Error(advanceError.message);

  revalidateAll();
}
