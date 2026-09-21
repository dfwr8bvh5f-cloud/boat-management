"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { todayLocalISO } from "@/lib/date-format";

// Every action here re-asserts management itself via requireManagement
// rather than trusting the page gate alone, same defense-in-depth every
// other MYS server action already has (see src/lib/actions/mys.ts).
function revalidateManagementFees() {
  revalidatePath("/mys");
  revalidatePath("/mys/debts");
}

// The "edit permanently" choice on the reminder popup - changes what this
// boat's management fee will default to from now on. The "edit just this
// time" choice never calls this at all; it only changes the value handed
// to createMysManagementFeeCharges below for that one row.
export async function updateMysManagementFeeTemplateAmount(templateId: string, amount: number) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_management_fee_templates").update({ amount }).eq("id", templateId);
  if (error) throw new Error(error.message);

  revalidateManagementFees();
}

// The reminder popup's "Add to debts" button - creates one real boat
// expense per row (same paid_by='management'/bill_to_mys=true/status=
// 'approved' shape createMysAdHocCharge's matched-boat branch already
// uses, so it shows up on /mys/debts and that boat's own Expenses list
// exactly like any other MYS-initiated charge), then stamps
// last_handled_period so this period's reminder stops firing. Best-effort
// per row - one boat's insert failing doesn't lose the rest.
export async function createMysManagementFeeCharges(
  rows: { templateId: string; boatId: string; amount: number; description: string; period: string }[]
) {
  const profile = await requireManagement();
  const supabase = await createClient();

  const today = todayLocalISO();
  const now = new Date().toISOString();
  const errors: string[] = [];

  for (const row of rows) {
    const { error: expenseError } = await supabase.from("expenses").insert({
      boat_id: row.boatId,
      description: row.description,
      amount: row.amount,
      category: "management",
      paid_by: "management",
      bill_to_mys: true,
      expense_date: today,
      status: "approved",
      created_by: profile.id,
      approved_by: profile.id,
      approved_at: now,
      mys_management_fee_template_id: row.templateId,
    });
    if (expenseError) {
      console.error("createMysManagementFeeCharges: failed to create charge", row, expenseError);
      errors.push(row.description);
      continue;
    }
    const { error: templateError } = await supabase
      .from("mys_management_fee_templates")
      .update({ last_handled_period: row.period })
      .eq("id", row.templateId);
    if (templateError) console.error("createMysManagementFeeCharges: failed to stamp last_handled_period", row, templateError);
    revalidatePath(`/boats/${row.boatId}/finance/expenses`);
  }

  revalidateManagementFees();
  return errors.length > 0 ? { errors } : undefined;
}

// The reminder popup's "delete this row" action - skips this one boat for
// the current period only (stamps last_handled_period without creating a
// charge), so it stops showing up until the next period's own reminder.
// Never touches the template's stored amount.
export async function skipMysManagementFeePeriod(templateId: string, period: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("mys_management_fee_templates").update({ last_handled_period: period }).eq("id", templateId);
  if (error) throw new Error(error.message);

  revalidateManagementFees();
}
