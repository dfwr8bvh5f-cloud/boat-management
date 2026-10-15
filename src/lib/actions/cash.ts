"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireBoatAccess } from "@/lib/auth";
import { emptyToNull, emptyToUndefined } from "@/lib/form-utils";
import type { ApprovalStatus, CashTxType } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";

// The set of pages that show a cash transaction's amount/status, revalidated
// together after any mutation that can change it - mirrors the identical
// helper already in bank-statement.ts and expenses.ts.
function revalidateAll(boatId: string) {
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

// A malformed/empty amount (e.g. a mobile number-keyboard quirk letting a
// non-numeric or blank value slip past the input's own type="number"
// validation) turns into NaN here, which the insert/update below would
// otherwise send on as JSON `null` - violating the column's not-null
// constraint and throwing a raw DB error. That throw's message gets
// redacted by Next.js in production (see deleteMysExpense's own comment,
// src/lib/actions/mys.ts), surfacing only as a generic crash screen with no
// way back - confirmed live as exactly this for a captain's cash entry.
// Caught here instead, before it ever reaches the database, as a refusal
// she needs to see and act on, not a bug - same { error } return pattern
// deleteMysExpense uses for the same reason.
function readValidAmount(formData: FormData): number | null {
  const amount = Number(formData.get("amount") ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export async function createCashTransaction(boatId: string, formData: FormData): Promise<{ error: string } | undefined> {
  const profile = await requireBoatAccess(boatId);
  const supabase = await createClient();

  const amount = readValidAmount(formData);
  if (amount === null) {
    const { t } = await getTranslator();
    return { error: t("error_invalid_amount") };
  }

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
  const type = String(formData.get("type") ?? "withdrawal") as CashTxType;
  // Left empty in the UI on purpose (no default date pushed on the user) -
  // omitting the key lets the column's own `default current_date` apply.
  const txDate = emptyToUndefined(formData.get("tx_date"));

  const { error } = await supabase.from("cash_transactions").insert({
    boat_id: boatId,
    type,
    amount,
    ...(txDate ? { tx_date: txDate } : {}),
    notes: emptyToNull(formData.get("notes")),
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) throw new Error(error.message);

  revalidateAll(boatId);
}

export async function updateCashTransaction(boatId: string, cashId: string, formData: FormData): Promise<{ error: string } | undefined> {
  await requireBoatAccess(boatId);
  const supabase = await createClient();

  const amount = readValidAmount(formData);
  if (amount === null) {
    const { t } = await getTranslator();
    return { error: t("error_invalid_amount") };
  }

  const txDate = emptyToUndefined(formData.get("tx_date"));

  const { error } = await supabase
    .from("cash_transactions")
    .update({
      type: String(formData.get("type") ?? "withdrawal") as CashTxType,
      amount,
      ...(txDate ? { tx_date: txDate } : {}),
      notes: emptyToNull(formData.get("notes")),
    })
    .eq("id", cashId);

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function deleteCashTransaction(boatId: string, cashId: string) {
  await requireBoatAccess(boatId);
  const supabase = await createClient();
  const { error } = await supabase.from("cash_transactions").delete().eq("id", cashId);
  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function approveCashTransaction(boatId: string, cashId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_transactions")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", cashId);

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}
