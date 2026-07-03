"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";
import type { ApprovalStatus, ExpenseCategory, PaymentMethod } from "@/lib/types/database";

type ParsedLine = { date: string; description: string; amount: number };

// Bulk-inserts the AI-parsed statement lines, then best-effort auto-matches
// each one against an existing unlinked card/bank_transfer expense with the
// same amount within a small date window - anything left unmatched (in
// either direction) is left for the reconciliation page to surface.
export async function importBankStatementLines(boatId: string, lines: ParsedLine[]) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const valid = lines.filter((l) => l.date && l.amount > 0);
  if (valid.length === 0) return;

  const rows = valid.map((l, i) => ({
    boat_id: boatId,
    tx_date: l.date,
    description: l.description.trim() || "—",
    amount: l.amount,
    statement_order: i,
    created_by: profile.id,
  }));

  const { data: inserted, error } = await supabase.from("bank_statement_lines").insert(rows).select("*");
  if (error) throw new Error(error.message);

  for (const line of inserted ?? []) {
    const { data: candidates } = await supabase
      .from("expenses")
      .select("id, expense_date")
      .eq("boat_id", boatId)
      .eq("amount", line.amount)
      .in("payment_method", ["card", "bank_transfer"])
      .is("bank_statement_line_id", null);

    const withinWindow = (candidates ?? []).filter((c) => {
      if (!c.expense_date) return false;
      const diffDays = Math.abs((new Date(c.expense_date).getTime() - new Date(line.tx_date).getTime()) / 86_400_000);
      return diffDays <= 3;
    });

    if (withinWindow.length === 1) {
      await supabase.from("expenses").update({ bank_statement_line_id: line.id }).eq("id", withinWindow[0].id);
    }
  }

  revalidatePath(`/boats/${boatId}/finance/bank-reconciliation`);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
}

export async function createExpenseFromStatementLine(boatId: string, lineId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: line } = await supabase.from("bank_statement_lines").select("*").eq("id", lineId).single();
  if (!line) {
    const { t } = await getTranslator();
    throw new Error(t("error_statement_line_not_found"));
  }

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { error } = await supabase.from("expenses").insert({
    boat_id: boatId,
    description: line.description,
    amount: line.amount,
    category: String(formData.get("category") ?? "other") as ExpenseCategory,
    payment_method: String(formData.get("payment_method") ?? "card") as PaymentMethod,
    paid_by: "crew",
    expense_date: line.tx_date,
    notes: emptyToNull(formData.get("notes")),
    bank_statement_line_id: lineId,
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/bank-reconciliation`);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

export async function linkExpenseToStatementLine(boatId: string, lineId: string, expenseId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").update({ bank_statement_line_id: lineId }).eq("id", expenseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/bank-reconciliation`);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
}

export async function unlinkStatementLine(boatId: string, expenseId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").update({ bank_statement_line_id: null }).eq("id", expenseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/bank-reconciliation`);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
}

export async function deleteBankStatementLine(boatId: string, lineId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("bank_statement_lines").delete().eq("id", lineId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/bank-reconciliation`);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
}
