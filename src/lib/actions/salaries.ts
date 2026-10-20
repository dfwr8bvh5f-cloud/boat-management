"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import { round2 } from "@/lib/money";
import { todayLocalISO } from "@/lib/date-format";
import type { PaymentMethod, SalaryPeriod } from "@/lib/types/database";

function revalidateAll() {
  revalidatePath("/salaries");
}

// ----------------------------------------------------------------------------
// MYS office/management staff (not tied to a boat - see mys_staff in
// 0122_salaries.sql). Mirrors createStaff/updateStaff (src/lib/actions/
// staff.ts) minus the approval workflow, which this table has no column for.
// ----------------------------------------------------------------------------

export async function createMysStaff(formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  const { error } = await supabase.from("mys_staff").insert({
    name,
    position: emptyToNull(formData.get("position")),
    nationality: emptyToNull(formData.get("nationality")),
    phone: emptyToNull(formData.get("phone")),
    salary: numberOrNull(formData.get("salary")),
    payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
  });
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateMysStaff(id: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  const { error } = await supabase
    .from("mys_staff")
    .update({
      name,
      position: emptyToNull(formData.get("position")),
      nationality: emptyToNull(formData.get("nationality")),
      phone: emptyToNull(formData.get("phone")),
      salary: numberOrNull(formData.get("salary")),
      payment_method: emptyToNull(formData.get("payment_method")) as PaymentMethod | null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function setMysStaffActive(id: string, active: boolean) {
  await requireManagement();
  const supabase = await createClient();
  const { error } = await supabase.from("mys_staff").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// ----------------------------------------------------------------------------
// Salary periods - one row per staff member per worked month. The page
// (src/app/(app)/salaries/page.tsx) synthesizes an unsaved "draft" period
// for any active staff member with no row yet for the selected month
// (pre-filled from their base salary) - this upsert is what turns that
// draft into a real row the first time she touches it, and updates it on
// every edit after. Exactly one of staffId/mysStaffId must be given.
// ----------------------------------------------------------------------------

export type StaffRef = { staffId: string; mysStaffId?: undefined } | { staffId?: undefined; mysStaffId: string };

function daysInMonth(periodMonth: string): number {
  const [y, m] = periodMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export async function upsertSalaryPeriod(ref: StaffRef, periodMonth: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const baseAmount = Number(formData.get("base_amount") ?? 0);
  // A checkbox that's unchecked submits nothing at all (no key in
  // FormData), not "off" - so the "did they leave mid-month" box is named
  // for its unchecked-by-default state (full month) rather than relying on
  // an "off" value that would never actually arrive.
  const fullMonth = formData.get("left_during_month") !== "on";
  const daysWorked = fullMonth ? null : numberOrNull(formData.get("days_worked"));
  const dim = daysInMonth(periodMonth);
  const proratedAmount = !fullMonth && daysWorked != null ? round2((baseAmount / dim) * daysWorked) : null;

  const { error } = await supabase.from("salary_periods").upsert(
    {
      staff_id: ref.staffId ?? null,
      mys_staff_id: ref.mysStaffId ?? null,
      period_month: periodMonth,
      base_amount: baseAmount,
      full_month: fullMonth,
      days_worked: daysWorked,
      days_in_month: dim,
      prorated_amount: proratedAmount,
      bonus_amount: numberOrNull(formData.get("bonus_amount")),
      cash_amount: numberOrNull(formData.get("cash_amount")),
      bank_amount: numberOrNull(formData.get("bank_amount")),
      notes: emptyToNull(formData.get("notes")),
    },
    { onConflict: ref.staffId ? "staff_id,period_month" : "mys_staff_id,period_month" }
  );
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Only allowed before it's ever been marked paid - a paid period must be
// unmarked first (unmarkSalaryPeriodPaid below), which is what actually
// cleans up the expense row(s) it created. Returns { error } for this
// foreseeable refusal instead of throwing, so it shows as a normal inline
// message rather than Next.js's generic production crash screen (see
// deleteMysExpense, src/lib/actions/mys.ts, for the same pattern and why).
export async function deleteSalaryPeriod(id: string): Promise<{ error: string } | undefined> {
  await requireManagement();
  const supabase = await createClient();

  const { data: period } = await supabase.from("salary_periods").select("paid").eq("id", id).single();
  if (period?.paid) {
    return { error: "This period is already marked paid - unmark it first." };
  }

  const { error } = await supabase.from("salary_periods").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

function monthLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

// Marking a period paid creates the real expense row(s) for it immediately
// (her explicit choice, over a separate "push to expenses" step) - one row
// if paid entirely by one method, two ("- Cash" / "- Bank" suffixed) if
// split across both. Boat crew bill to the boat's own expenses (category
// "crew", paid_by "management", never bill_to_mys - this is the boat's own
// payroll cost, not a charge back to it); MYS office staff bill to
// mys_expenses under the existing "salaries" category. linked_*_expense_id
// records exactly which row(s) this created, so unmarking can clean up
// precisely instead of guessing.
export async function markSalaryPeriodPaid(periodId: string): Promise<{ error: string } | undefined> {
  const profile = await requireManagement();
  const supabase = await createClient();

  const { data: period } = await supabase.from("salary_periods").select("*").eq("id", periodId).single();
  if (!period) return { error: "Salary period not found" };
  if (period.paid) return;

  let personLabel: string;
  let boatId: string | null = null;
  if (period.staff_id) {
    const { data: staff } = await supabase.from("staff").select("name, position, boat_id").eq("id", period.staff_id).single();
    if (!staff) return { error: "Staff member not found" };
    personLabel = staff.position || staff.name;
    boatId = staff.boat_id;
  } else {
    const { data: ms } = await supabase.from("mys_staff").select("name, position").eq("id", period.mys_staff_id!).single();
    if (!ms) return { error: "Staff member not found" };
    personLabel = ms.position || ms.name;
  }

  const baseDescription = `Salary ${personLabel}- ${monthLabel(period.period_month)}`;
  const totalAmount = round2((period.full_month ? period.base_amount : (period.prorated_amount ?? 0)) + (period.bonus_amount ?? 0));
  const today = todayLocalISO();
  const now = new Date().toISOString();

  async function insertExpenseRow(amount: number, method: "cash" | "bank_transfer", suffix: string) {
    if (boatId) {
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          boat_id: boatId,
          description: `${baseDescription}${suffix}`,
          amount,
          category: "crew",
          payment_method: method,
          paid_by: "management",
          bill_to_mys: false,
          expense_date: today,
          status: "approved",
          created_by: profile.id,
          approved_by: profile.id,
          approved_at: now,
          is_warranty: false,
          is_payment_plan: false,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Failed to create boat expense");
      return { key: method === "cash" ? "linked_cash_boat_expense_id" : "linked_bank_boat_expense_id", id: data.id } as const;
    }
    const { data, error } = await supabase
      .from("mys_expenses")
      .insert({
        category: "salaries",
        description: `${baseDescription}${suffix}`,
        amount,
        payment_method: method,
        expense_date: today,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to create MYS expense");
    return { key: method === "cash" ? "linked_cash_mys_expense_id" : "linked_bank_mys_expense_id", id: data.id } as const;
  }

  const cash = period.cash_amount ?? 0;
  const bank = period.bank_amount ?? 0;
  const updates: Partial<SalaryPeriod> = { paid: true, paid_at: now };

  if (cash > 0 && bank > 0) {
    const cashRow = await insertExpenseRow(cash, "cash", "- Cash");
    const bankRow = await insertExpenseRow(bank, "bank_transfer", "- Bank");
    updates[cashRow.key] = cashRow.id;
    updates[bankRow.key] = bankRow.id;
  } else {
    const amount = cash > 0 ? cash : bank > 0 ? bank : totalAmount;
    const method: "cash" | "bank_transfer" = cash > 0 ? "cash" : "bank_transfer";
    const row = await insertExpenseRow(amount, method, "");
    updates[row.key] = row.id;
  }

  const { error: updateError } = await supabase.from("salary_periods").update(updates).eq("id", periodId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/salaries");
  if (boatId) {
    revalidatePath(`/boats/${boatId}/finance/expenses`);
    revalidatePath(`/boats/${boatId}`);
  } else {
    revalidatePath("/mys/expenses");
  }
}

// Deletes whichever expense row(s) the period created and clears the link,
// so she can correct a mistake (wrong amount, wrong split) and re-mark it
// paid rather than being stuck with a wrong expense forever.
export async function unmarkSalaryPeriodPaid(periodId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { data: period } = await supabase.from("salary_periods").select("*").eq("id", periodId).single();
  if (!period) throw new Error("Salary period not found");

  if (period.linked_cash_boat_expense_id) await supabase.from("expenses").delete().eq("id", period.linked_cash_boat_expense_id);
  if (period.linked_bank_boat_expense_id) await supabase.from("expenses").delete().eq("id", period.linked_bank_boat_expense_id);
  if (period.linked_cash_mys_expense_id) await supabase.from("mys_expenses").delete().eq("id", period.linked_cash_mys_expense_id);
  if (period.linked_bank_mys_expense_id) await supabase.from("mys_expenses").delete().eq("id", period.linked_bank_mys_expense_id);

  const { error } = await supabase
    .from("salary_periods")
    .update({
      paid: false,
      paid_at: null,
      linked_cash_boat_expense_id: null,
      linked_bank_boat_expense_id: null,
      linked_cash_mys_expense_id: null,
      linked_bank_mys_expense_id: null,
    })
    .eq("id", periodId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// ----------------------------------------------------------------------------
// Staff loans - manual repayment tracking, her explicit choice over
// automatic deduction from a future salary period.
// ----------------------------------------------------------------------------

export async function createStaffLoan(ref: StaffRef, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const amount = Number(formData.get("amount") ?? 0);
  if (!amount || amount <= 0) throw new Error("Enter a valid loan amount");

  const { error } = await supabase.from("staff_loans").insert({
    staff_id: ref.staffId ?? null,
    mys_staff_id: ref.mysStaffId ?? null,
    amount,
    loan_date: emptyToNull(formData.get("loan_date")) ?? todayLocalISO(),
    notes: emptyToNull(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteStaffLoan(id: string) {
  await requireManagement();
  const supabase = await createClient();
  const { error } = await supabase.from("staff_loans").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function addLoanRepayment(loanId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const amount = Number(formData.get("amount") ?? 0);
  if (!amount || amount <= 0) throw new Error("Enter a valid repayment amount");

  const { error } = await supabase.from("staff_loan_repayments").insert({
    loan_id: loanId,
    amount,
    repaid_on: emptyToNull(formData.get("repaid_on")) ?? todayLocalISO(),
    notes: emptyToNull(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteLoanRepayment(id: string) {
  await requireManagement();
  const supabase = await createClient();
  const { error } = await supabase.from("staff_loan_repayments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
