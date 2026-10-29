"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import { formatCurrency, round2 } from "@/lib/money";
import { todayLocalISO } from "@/lib/date-format";
import type { PaymentMethod, SalaryPeriod } from "@/lib/types/database";

function revalidateAll() {
  revalidatePath("/mys/salaries");
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

export async function deleteMysStaff(id: string) {
  await requireManagement();
  const supabase = await createClient();
  const { error } = await supabase.from("mys_staff").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Quick edits for the employment start date, shown and editable directly
// from the Salaries row for both staff kinds (staff.start_date already
// existed for boat crew - mys_staff.start_date is new, see
// 0124_mys_staff_start_date.sql) - a separate immediate-save action rather
// than folding it into upsertSalaryPeriod's own form, since it writes to a
// different table entirely.
// staff.start_date is not-null (unlike mys_staff's) - this never clears it,
// only sets it to a real picked date.
export async function setStaffStartDate(staffId: string, startDate: string) {
  await requireManagement();
  const supabase = await createClient();
  const { error } = await supabase.from("staff").update({ start_date: startDate }).eq("id", staffId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function setMysStaffStartDate(mysStaffId: string, startDate: string | null) {
  await requireManagement();
  const supabase = await createClient();
  const { error } = await supabase.from("mys_staff").update({ start_date: startDate }).eq("id", mysStaffId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// ----------------------------------------------------------------------------
// Salary periods - one row per staff member per worked month. The page
// (src/app/(app)/mys/salaries/page.tsx) synthesizes an unsaved "draft" period
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
  const dim = daysInMonth(periodMonth);
  // Days worked is derived from the last-working-day she picks, not typed
  // directly - every calendar day counts the same (no weekday/weekend
  // distinction), matching days_in_month above. A date outside this
  // period's own month (shouldn't happen - the picker is bounded to it) is
  // dropped rather than trusted, same as any other foreseeable bad input.
  const leftDateRaw = emptyToNull(formData.get("left_date"));
  const leftDate = !fullMonth && leftDateRaw && leftDateRaw.startsWith(periodMonth.slice(0, 7)) ? leftDateRaw : null;
  const daysWorked = leftDate ? Number(leftDate.slice(8, 10)) : null;
  const proratedAmount = !fullMonth && daysWorked != null ? round2((baseAmount / dim) * daysWorked) : null;

  const { data, error } = await supabase
    .from("salary_periods")
    .upsert(
      {
        staff_id: ref.staffId ?? null,
        mys_staff_id: ref.mysStaffId ?? null,
        period_month: periodMonth,
        base_amount: baseAmount,
        full_month: fullMonth,
        days_worked: daysWorked,
        left_date: leftDate,
        days_in_month: dim,
        prorated_amount: proratedAmount,
        bonus_amount: numberOrNull(formData.get("bonus_amount")),
        bonus_description: emptyToNull(formData.get("bonus_description")),
        cash_amount: numberOrNull(formData.get("cash_amount")),
        bank_amount: numberOrNull(formData.get("bank_amount")),
        loan_repayment_amount: numberOrNull(formData.get("loan_repayment_amount")),
        notes: emptyToNull(formData.get("notes")),
      },
      { onConflict: ref.staffId ? "staff_id,period_month" : "mys_staff_id,period_month" }
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return { id: data.id };
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

// A salary worked in month X is due the 1st of month X+1 (her own
// confirmed convention - "Salary stew- October" is October's work, paid in
// November) - the expense this creates is dated that scheduled payment
// date, not whatever day she happens to click "mark paid".
function salaryDueDate(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

// The loan this person is currently paying off, if any - oldest loan first
// (first taken, first cleared), skipping any already fully repaid. Used to
// attach a monthly auto-deduction to the right loan without the caller
// having to track a loan id separately; recomputed the same way the UI
// itself derives "the active loan" from the same underlying rows.
async function findActiveLoanId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ref: { staffId: string | null; mysStaffId: string | null }
): Promise<string | null> {
  const query = supabase.from("staff_loans").select("id, amount").order("loan_date", { ascending: true });
  const { data: loans } = ref.staffId ? await query.eq("staff_id", ref.staffId) : await query.eq("mys_staff_id", ref.mysStaffId!);
  if (!loans || loans.length === 0) return null;

  const loanIds = loans.map((l) => l.id);
  const { data: repayments } = await supabase.from("staff_loan_repayments").select("loan_id, amount").in("loan_id", loanIds);
  const repaidByLoan = new Map<string, number>();
  for (const r of repayments ?? []) repaidByLoan.set(r.loan_id, round2((repaidByLoan.get(r.loan_id) ?? 0) + r.amount));

  for (const loan of loans) {
    const outstanding = round2(loan.amount - (repaidByLoan.get(loan.id) ?? 0));
    if (outstanding > 0) return loan.id;
  }
  return null;
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
    personLabel = ms.name;
  }

  const baseDescription = `Salary-${monthLabel(period.period_month)}-${personLabel}`;
  const baseAmount = round2(period.full_month ? period.base_amount : (period.prorated_amount ?? 0));
  const totalAmount = round2(baseAmount + (period.bonus_amount ?? 0));
  const dueDate = salaryDueDate(period.period_month);
  const now = new Date().toISOString();

  // Surfaces what the total is actually made of, since the expense's own
  // amount is just the one number paid via this method - not visible
  // anywhere else once a split payment or a prorated month is involved.
  // Her own free-text note on the period carries over first, since it's
  // the one piece here she actually wrote herself.
  const noteParts: string[] = [];
  if (period.notes) noteParts.push(period.notes);
  if (period.bonus_amount && period.bonus_amount > 0) {
    noteParts.push(
      `Salary: ${formatCurrency(baseAmount)}, Extra: ${formatCurrency(period.bonus_amount)}${
        period.bonus_description ? ` - ${period.bonus_description}` : ""
      }`
    );
  }
  if (!period.full_month && period.left_date && period.days_worked != null) {
    noteParts.push(`Worked ${period.days_worked} of ${period.days_in_month} days, ended ${period.left_date}`);
  }
  const expenseNotes = noteParts.length ? noteParts.join(" | ") : null;

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
          expense_date: dueDate,
          status: "approved",
          notes: expenseNotes,
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
        expense_date: dueDate,
        notes: expenseNotes,
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

  if (period.loan_repayment_amount && period.loan_repayment_amount > 0) {
    const activeLoanId = await findActiveLoanId(supabase, { staffId: period.staff_id, mysStaffId: period.mys_staff_id });
    if (activeLoanId) {
      const { data: repayRow, error: repayError } = await supabase
        .from("staff_loan_repayments")
        .insert({ loan_id: activeLoanId, amount: period.loan_repayment_amount, repaid_on: dueDate, salary_period_id: period.id })
        .select("id")
        .single();
      if (repayError || !repayRow) throw new Error(repayError?.message ?? "Failed to record loan repayment");
      updates.linked_loan_repayment_id = repayRow.id;
    }
  }

  const { error: updateError } = await supabase.from("salary_periods").update(updates).eq("id", periodId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/mys/salaries");
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
  if (period.linked_loan_repayment_id) await supabase.from("staff_loan_repayments").delete().eq("id", period.linked_loan_repayment_id);

  const { error } = await supabase
    .from("salary_periods")
    .update({
      paid: false,
      paid_at: null,
      linked_cash_boat_expense_id: null,
      linked_bank_boat_expense_id: null,
      linked_cash_mys_expense_id: null,
      linked_bank_mys_expense_id: null,
      linked_loan_repayment_id: null,
    })
    .eq("id", periodId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// ----------------------------------------------------------------------------
// Staff loans. A loan can optionally carry a fixed monthly_repayment, which
// the Salaries row prefills as that month's loan_repayment_amount (editable
// per month) - marking the period paid is what actually records the
// deduction as a staff_loan_repayments row (see findActiveLoanId and
// markSalaryPeriodPaid above). A repayment can still be added directly
// here too (manual entries just leave salary_period_id null), e.g. for an
// off-cycle extra payment.
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
    monthly_repayment: numberOrNull(formData.get("monthly_repayment")),
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
