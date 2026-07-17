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

// Picks the closest-dated candidate to link to. When several unlinked
// records share the exact same amount (e.g. two identical insurance
// installments on the same day), they're financially indistinguishable
// from one another, so there's no real ambiguity worth blocking on -
// linking to the nearest one by date is as correct as any other choice.
function closestByDate<T>(candidates: T[], getDate: (c: T) => string, txDate: string): T | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) =>
    Math.abs(new Date(getDate(c)).getTime() - new Date(txDate).getTime()) <
    Math.abs(new Date(getDate(best)).getTime() - new Date(txDate).getTime())
      ? c
      : best
  );
}

// Best-effort auto-match for a batch of imported lines against the right
// ledger tables, linking each to the closest-dated unlinked record with the
// same amount - anything with no candidate within the date window is left
// for manual review on the reconciliation page.
//
// Candidates are fetched once per table (not once per line) - a boat's
// *unlinked* expenses/withdrawals/incomes are a small, bounded set (already
// matched records are excluded by the query), so this stays cheap even for a
// large statement import, versus the previous one-select-per-line version
// which cost up to 3 round trips per line. Matching then runs in memory,
// removing a candidate from its pool the moment it's claimed by a line -
// exactly mirroring the old behavior of re-querying "still unlinked" fresh
// before every match, just without the network round trip each time. The
// one intentional behavior change: a candidate freed up by a *concurrent*
// edit elsewhere (e.g. someone unlinking a record on the reconciliation
// page mid-import) won't be picked up until the next run, since the pool is
// a snapshot taken at the start of this batch rather than re-read per line.
async function autoMatchLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  lines: { id: string; amount: number; tx_date: string; line_type: BankStmtLineType }[]
) {
  const expenseLines = lines.filter((l) => l.line_type === "expense");
  const cashLines = lines.filter((l) => l.line_type === "cash_withdrawal");
  const incomeLines = lines.filter((l) => l.line_type === "income");

  const [{ data: expenseCandidates }, { data: cashCandidates }, { data: incomeCandidates }] = await Promise.all([
    expenseLines.length > 0
      ? supabase
          .from("expenses")
          .select("id, amount, expense_date")
          .eq("boat_id", boatId)
          .in("payment_method", ["card", "bank_transfer"])
          .is("bank_statement_line_id", null)
      : Promise.resolve({ data: [] as { id: string; amount: number; expense_date: string | null }[] }),
    cashLines.length > 0
      ? supabase
          .from("cash_transactions")
          .select("id, amount, tx_date")
          .eq("boat_id", boatId)
          .eq("type", "withdrawal")
          .is("bank_statement_line_id", null)
      : Promise.resolve({ data: [] as { id: string; amount: number; tx_date: string }[] }),
    incomeLines.length > 0
      ? supabase
          .from("incomes")
          .select("id, amount, income_date")
          .eq("boat_id", boatId)
          .eq("type", "actual")
          .is("bank_statement_line_id", null)
      : Promise.resolve({ data: [] as { id: string; amount: number; income_date: string }[] }),
  ]);

  let expensePool = expenseCandidates ?? [];
  for (const line of expenseLines) {
    const matches = expensePool.filter(
      (c) => c.amount === line.amount && c.expense_date && withinDateWindow(c.expense_date, line.tx_date)
    );
    const best = closestByDate(matches, (c) => c.expense_date as string, line.tx_date);
    if (best) {
      await supabase.from("expenses").update({ bank_statement_line_id: line.id }).eq("id", best.id);
      expensePool = expensePool.filter((c) => c.id !== best.id);
    }
  }

  let cashPool = cashCandidates ?? [];
  for (const line of cashLines) {
    const matches = cashPool.filter((c) => c.amount === line.amount && withinDateWindow(c.tx_date, line.tx_date));
    const best = closestByDate(matches, (c) => c.tx_date, line.tx_date);
    if (best) {
      await supabase.from("cash_transactions").update({ bank_statement_line_id: line.id }).eq("id", best.id);
      cashPool = cashPool.filter((c) => c.id !== best.id);
    }
  }

  let incomePool = incomeCandidates ?? [];
  for (const line of incomeLines) {
    const matches = incomePool.filter((c) => c.amount === line.amount && withinDateWindow(c.income_date, line.tx_date));
    const best = closestByDate(matches, (c) => c.income_date, line.tx_date);
    if (best) {
      await supabase.from("incomes").update({ bank_statement_line_id: line.id }).eq("id", best.id);
      incomePool = incomePool.filter((c) => c.id !== best.id);
    }
  }
}

// Re-runs auto-matching for lines that are still unmatched - useful after
// an auto-match rule changes (or a candidate record's amount gets fixed),
// since the original import only attempts the match once, at insert time.
export async function rematchBankStatementLines(boatId: string) {
  const supabase = await createClient();

  const [{ data: lines }, { data: linkedExpenses }, { data: linkedCashTx }, { data: linkedIncomes }] = await Promise.all([
    supabase.from("bank_statement_lines").select("id, amount, tx_date, line_type").eq("boat_id", boatId),
    supabase.from("expenses").select("bank_statement_line_id").eq("boat_id", boatId).not("bank_statement_line_id", "is", null),
    supabase
      .from("cash_transactions")
      .select("bank_statement_line_id")
      .eq("boat_id", boatId)
      .not("bank_statement_line_id", "is", null),
    supabase.from("incomes").select("bank_statement_line_id").eq("boat_id", boatId).not("bank_statement_line_id", "is", null),
  ]);

  const linkedIds = new Set(
    [...(linkedExpenses ?? []), ...(linkedCashTx ?? []), ...(linkedIncomes ?? [])].map((r) => r.bank_statement_line_id)
  );
  const unmatched = (lines ?? []).filter((l) => !linkedIds.has(l.id));

  await autoMatchLines(supabase, boatId, unmatched);

  revalidateAll(boatId);
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
//
// Skips any line that's an exact (date, amount, description) repeat of a
// line already imported for this boat - re-uploading/re-scanning the same
// statement (e.g. after a fix, or by mistake) would otherwise insert a
// second competing line for a transaction that's already been matched,
// which can never itself find a candidate (the real record is already
// claimed) and shows up as a permanent false "gap".
export async function importBankStatementLines(boatId: string, lines: ParsedLine[]) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const valid = lines.filter((l) => l.date && l.amount > 0);
  if (valid.length === 0) return;

  const { data: existing } = await supabase
    .from("bank_statement_lines")
    .select("tx_date, amount, description, statement_order")
    .eq("boat_id", boatId);
  const existingKeys = new Set((existing ?? []).map((l) => `${l.tx_date}|${l.amount}|${l.description}`));
  // statement_order must stay comparable across separate uploads (e.g.
  // April's statement, then June's) so the expense list can follow the
  // statement's own row sequence directly instead of grouping by date -
  // continuing the count from the boat's highest existing value, rather
  // than restarting at 0 for every import, keeps every batch's rows after
  // all previously-imported ones.
  const nextOrderStart = (existing ?? []).reduce((max, l) => Math.max(max, l.statement_order), -1) + 1;

  const rows = valid
    .filter((l) => !existingKeys.has(`${l.date}|${l.amount}|${l.description.trim() || "—"}`))
    .map((l, i) => ({
      boat_id: boatId,
      tx_date: l.date,
      description: l.description.trim() || "—",
      amount: l.amount,
      statement_order: nextOrderStart + i,
      line_type: l.line_type,
      created_by: profile.id,
    }));

  if (rows.length === 0) {
    revalidateAll(boatId);
    return;
  }

  const { data: inserted, error } = await supabase.from("bank_statement_lines").insert(rows).select("*");
  if (error) throw new Error(error.message);

  await autoMatchLines(supabase, boatId, inserted ?? []);

  revalidateAll(boatId);
}

// A double click (or a stale reconciliation list rendered before the
// previous accept finished revalidating) must never be able to create two
// records off the same statement line - that's how the same real bank fee
// ends up entered as an expense multiple times.
async function isLineAlreadyLinked(supabase: Awaited<ReturnType<typeof createClient>>, lineId: string): Promise<boolean> {
  const [{ count: expenseCount }, { count: cashCount }, { count: incomeCount }] = await Promise.all([
    supabase.from("expenses").select("id", { count: "exact", head: true }).eq("bank_statement_line_id", lineId),
    supabase.from("cash_transactions").select("id", { count: "exact", head: true }).eq("bank_statement_line_id", lineId),
    supabase.from("incomes").select("id", { count: "exact", head: true }).eq("bank_statement_line_id", lineId),
  ]);
  return (expenseCount ?? 0) > 0 || (cashCount ?? 0) > 0 || (incomeCount ?? 0) > 0;
}

export async function createExpenseFromStatementLine(boatId: string, lineId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: line } = await supabase.from("bank_statement_lines").select("*").eq("id", lineId).single();
  if (!line) {
    const { t } = await getTranslator();
    throw new Error(t("error_statement_line_not_found"));
  }
  if (await isLineAlreadyLinked(supabase, lineId)) {
    revalidateAll(boatId);
    return;
  }

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const description = String(formData.get("description") ?? "").trim() || line.description;

  const { error } = await supabase.from("expenses").insert({
    boat_id: boatId,
    description,
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
  if (await isLineAlreadyLinked(supabase, lineId)) {
    revalidateAll(boatId);
    return;
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
  if (await isLineAlreadyLinked(supabase, lineId)) {
    revalidateAll(boatId);
    return;
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

// Lets a still-unmatched imported line be reclassified (e.g. the AI read
// it as an income but it's really an expense) before creating a record
// from it, without having to delete and re-scan the whole statement.
export async function updateBankStatementLineType(boatId: string, lineId: string, lineType: BankStmtLineType) {
  const supabase = await createClient();
  const { error } = await supabase.from("bank_statement_lines").update({ line_type: lineType }).eq("id", lineId);
  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

// Corrects an existing record's date/amount/description - either to adopt
// what a scanned bank statement line actually shows (near-match
// correction), or as a plain quick-edit of a record that turned up as a
// gap with no statement line at all. When lineId is given it also links
// the record to that line; when null it just fixes the record in place.
export async function adoptStatementLineIntoRecord(
  boatId: string,
  lineId: string | null,
  recordType: BankStmtLineType,
  recordId: string,
  updates: { tx_date?: string; amount?: number; description?: string }
) {
  const supabase = await createClient();
  // Adopting a statement line resolves the gap that got a record archived
  // in the first place (if it was), so it must come back into the regular
  // view/reports here - otherwise it'd stay hidden despite now being
  // properly matched.
  const linkField = lineId ? { bank_statement_line_id: lineId, archived_at: null } : {};

  const { error } =
    recordType === "expense"
      ? await supabase
          .from("expenses")
          .update({
            ...linkField,
            ...(updates.tx_date ? { expense_date: updates.tx_date } : {}),
            ...(updates.amount !== undefined ? { amount: updates.amount } : {}),
            ...(updates.description !== undefined ? { description: updates.description } : {}),
          })
          .eq("id", recordId)
      : recordType === "cash_withdrawal"
        ? await supabase
            .from("cash_transactions")
            .update({
              ...linkField,
              ...(updates.tx_date ? { tx_date: updates.tx_date } : {}),
              ...(updates.amount !== undefined ? { amount: updates.amount } : {}),
              ...(updates.description !== undefined ? { notes: updates.description } : {}),
            })
            .eq("id", recordId)
        : await supabase
            .from("incomes")
            .update({
              ...linkField,
              ...(updates.tx_date ? { income_date: updates.tx_date } : {}),
              ...(updates.amount !== undefined ? { amount: updates.amount } : {}),
              ...(updates.description !== undefined ? { source: updates.description } : {}),
            })
            .eq("id", recordId);

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

// Deletes the ledger record itself (expense/cash withdrawal/income) - used
// from the "records not found on the statement" gap list, where a flagged
// record often turns out to be a genuine duplicate rather than a
// date/amount typo worth correcting.
export async function deleteReconciliationRecord(boatId: string, recordType: BankStmtLineType, recordId: string) {
  const supabase = await createClient();

  if (recordType === "expense") {
    const { data: existing } = await supabase.from("expenses").select("receipt_path, photo_path").eq("id", recordId).single();
    const { error } = await supabase.from("expenses").delete().eq("id", recordId);
    if (error) throw new Error(error.message);
    const toRemove = [existing?.receipt_path, existing?.photo_path].filter((p): p is string => Boolean(p));
    if (toRemove.length) await supabase.storage.from("receipts").remove(toRemove);
  } else if (recordType === "cash_withdrawal") {
    const { error } = await supabase.from("cash_transactions").delete().eq("id", recordId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("incomes").delete().eq("id", recordId);
    if (error) throw new Error(error.message);
  }

  revalidateAll(boatId);
}

export async function deleteBankStatementLine(boatId: string, lineId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("bank_statement_lines").delete().eq("id", lineId);
  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

// Pulls a record out of the "not found on statement" list and out of every
// financial total/report, WITHOUT deleting it - it stays in the database so
// a future statement scan can still match it, and can be brought back at
// any time from the archived list.
export async function archiveReconciliationRecord(boatId: string, recordType: BankStmtLineType, recordId: string) {
  const supabase = await createClient();
  const table = recordType === "expense" ? "expenses" : recordType === "cash_withdrawal" ? "cash_transactions" : "incomes";
  const { error } = await supabase.from(table).update({ archived_at: new Date().toISOString() }).eq("id", recordId);
  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function unarchiveReconciliationRecord(boatId: string, recordType: BankStmtLineType, recordId: string) {
  const supabase = await createClient();
  const table = recordType === "expense" ? "expenses" : recordType === "cash_withdrawal" ? "cash_transactions" : "incomes";
  const { error } = await supabase.from(table).update({ archived_at: null }).eq("id", recordId);
  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function deleteBankStatementFile(boatId: string, fileId: string) {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("bank_statement_files").select("file_path").eq("id", fileId).single();
  const { error } = await supabase.from("bank_statement_files").delete().eq("id", fileId);
  if (error) throw new Error(error.message);
  if (existing?.file_path) await supabase.storage.from("bank-statements").remove([existing.file_path]);
  revalidateAll(boatId);
}
