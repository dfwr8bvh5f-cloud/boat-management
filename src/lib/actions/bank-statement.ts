"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";
import type { ApprovalStatus, BankStmtLineType, ExpenseCategory, PaymentMethod } from "@/lib/types/database";

type ParsedLine = { date: string; description: string; amount: number; line_type: BankStmtLineType };

function withinDateWindow(a: string, b: string, maxDays = 3) {
  const diffDays = Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
  return diffDays <= maxDays;
}

// Best-effort auto-match for one imported line against the right ledger
// table - only auto-links when there's exactly one candidate, to avoid a
// wrong guess; anything ambiguous is left for manual review.
async function autoMatchLine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  line: { id: string; amount: number; tx_date: string; line_type: BankStmtLineType }
) {
  if (line.line_type === "expense") {
    const { data: candidates } = await supabase
      .from("expenses")
      .select("id, expense_date")
      .eq("boat_id", boatId)
      .eq("amount", line.amount)
      .in("payment_method", ["card", "bank_transfer"])
      .is("bank_statement_line_id", null);
    const matches = (candidates ?? []).filter((c) => c.expense_date && withinDateWindow(c.expense_date, line.tx_date));
    if (matches.length === 1) {
      await supabase.from("expenses").update({ bank_statement_line_id: line.id }).eq("id", matches[0].id);
    }
    return;
  }

  if (line.line_type === "cash_withdrawal") {
    const { data: candidates } = await supabase
      .from("cash_transactions")
      .select("id, tx_date")
      .eq("boat_id", boatId)
      .eq("amount", line.amount)
      .eq("type", "withdrawal")
      .is("bank_statement_line_id", null);
    const matches = (candidates ?? []).filter((c) => withinDateWindow(c.tx_date, line.tx_date));
    if (matches.length === 1) {
      await supabase.from("cash_transactions").update({ bank_statement_line_id: line.id }).eq("id", matches[0].id);
    }
    return;
  }

  const { data: candidates } = await supabase
    .from("incomes")
    .select("id, income_date")
    .eq("boat_id", boatId)
    .eq("amount", line.amount)
    .eq("type", "actual")
    .is("bank_statement_line_id", null);
  const matches = (candidates ?? []).filter((c) => withinDateWindow(c.income_date, line.tx_date));
  if (matches.length === 1) {
    await supabase.from("incomes").update({ bank_statement_line_id: line.id }).eq("id", matches[0].id);
  }
}

function revalidateAll(boatId: string) {
  revalidatePath(`/boats/${boatId}/finance/bank-reconciliation`);
  revalidatePath(`/boats/${boatId}/finance/expenses`);
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/cash`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

// Bulk-inserts the AI-parsed statement lines, then best-effort auto-matches
// each one against an existing unlinked record in the right ledger
// (expenses / cash withdrawals / incomes) with the same amount within a
// small date window - anything left unmatched (in either direction) is
// left for the reconciliation page to surface.
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
    line_type: l.line_type,
    created_by: profile.id,
  }));

  const { data: inserted, error } = await supabase.from("bank_statement_lines").insert(rows).select("*");
  if (error) throw new Error(error.message);

  for (const line of inserted ?? []) {
    await autoMatchLine(supabase, boatId, line);
  }

  revalidateAll(boatId);
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
  revalidateAll(boatId);
}

export async function createCashWithdrawalFromStatementLine(boatId: string, lineId: string) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: line } = await supabase.from("bank_statement_lines").select("*").eq("id", lineId).single();
  if (!line) {
    const { t } = await getTranslator();
    throw new Error(t("error_statement_line_not_found"));
  }

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { error } = await supabase.from("cash_transactions").insert({
    boat_id: boatId,
    type: "withdrawal",
    amount: line.amount,
    tx_date: line.tx_date,
    notes: line.description,
    bank_statement_line_id: lineId,
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function createIncomeFromStatementLine(boatId: string, lineId: string) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: line } = await supabase.from("bank_statement_lines").select("*").eq("id", lineId).single();
  if (!line) {
    const { t } = await getTranslator();
    throw new Error(t("error_statement_line_not_found"));
  }

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { error } = await supabase.from("incomes").insert({
    boat_id: boatId,
    source: line.description,
    amount: line.amount,
    income_date: line.tx_date,
    type: "actual",
    bank_statement_line_id: lineId,
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function deleteBankStatementLine(boatId: string, lineId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("bank_statement_lines").delete().eq("id", lineId);
  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}
