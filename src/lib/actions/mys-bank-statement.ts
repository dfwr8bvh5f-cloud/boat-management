"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { sameStatementLine } from "@/lib/bank-statement-dedup";
import type { BankStmtLineType } from "@/lib/types/database";

// Mirrors src/lib/actions/bank-statement.ts, scoped to MYS's own expenses
// (mys_expenses) instead of a boat's three ledgers - see
// supabase/migrations/0078_mys_bank_reconciliation.sql for why this is a
// parallel file rather than a generalization of the boat-scoped one.
//
// Only mirrors the boat actions the boat's own reconciliation UI actually
// calls (confirmed by grep across src/ before writing this file):
// createExpenseFromStatementLine, createCashWithdrawalFromStatementLine,
// createIncomeFromStatementLine, updateBankStatementLineType,
// rematchBankStatementLines and deleteBankStatementLine are exported there
// but unused by any current UI, so they have no MYS equivalent here.
// Creating a new expense from a line reuses createMysExpense
// (src/lib/actions/mys.ts) directly, the same way the boat UI's
// "accept new line" reuses the plain createExpense - see
// mys-bank-reconciliation-manager.tsx. Deleting the ledger record itself
// reuses the existing deleteMysExpense, also from mys.ts.

type ParsedLine = { date: string; description: string; amount: number; line_type: BankStmtLineType };

function withinDateWindow(a: string, b: string, maxDays = 3) {
  const diffDays = Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
  return diffDays <= maxDays;
}

// Picks the closest-dated candidate to link to - see the identical helper
// in bank-statement.ts for why ties (same amount, same day) aren't worth
// blocking on.
function closestByDate<T>(candidates: T[], getDate: (c: T) => string, txDate: string): T | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) =>
    Math.abs(new Date(getDate(c)).getTime() - new Date(txDate).getTime()) <
    Math.abs(new Date(getDate(best)).getTime() - new Date(txDate).getTime())
      ? c
      : best
  );
}

// Best-effort auto-match for freshly imported lines against mys_expenses -
// same approach as autoMatchLines in bank-statement.ts, simplified to one
// ledger. Only "expense" line_type lines have anything to match against;
// income/cash_withdrawal lines are left unmatched (v1 scope is mys_expenses
// only - see 0078's header comment).
async function autoMatchMysLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lines: { id: string; amount: number; tx_date: string; line_type: BankStmtLineType }[]
) {
  const expenseLines = lines.filter((l) => l.line_type === "expense");
  if (expenseLines.length === 0) return;

  const { data: candidates } = await supabase
    .from("mys_expenses")
    .select("id, amount, expense_date")
    .in("payment_method", ["card", "bank_transfer"])
    .is("bank_statement_line_id", null);

  const writes: PromiseLike<unknown>[] = [];
  let pool = candidates ?? [];
  for (const line of expenseLines) {
    const matches = pool.filter((c) => c.amount === line.amount && withinDateWindow(c.expense_date, line.tx_date));
    const best = closestByDate(matches, (c) => c.expense_date, line.tx_date);
    if (best) {
      writes.push(supabase.from("mys_expenses").update({ bank_statement_line_id: line.id }).eq("id", best.id));
      pool = pool.filter((c) => c.id !== best.id);
    }
  }
  await Promise.all(writes);
}

function revalidateAll() {
  revalidatePath("/mys/bank-reconciliation");
  revalidatePath("/mys/expenses");
  revalidatePath("/mys");
}

// Bulk-inserts AI-parsed statement lines, then best-effort auto-matches each
// one against an existing unlinked mys_expenses row with the same amount
// within a small date window. Skips any line that's a (date, amount) repeat
// of one already imported (see sameStatementLine) - same re-scan/dedup
// protection as the boat version.
export async function importMysBankStatementLines(lines: ParsedLine[]) {
  const profile = await requireManagement();
  const supabase = await createClient();

  const valid = lines.filter((l) => l.date && l.amount > 0);
  if (valid.length === 0) return;

  const { data: existing } = await supabase
    .from("mys_bank_statement_lines")
    .select("tx_date, amount, description, statement_order");
  const existingByDateAmount = new Map<string, string[]>();
  for (const l of existing ?? []) {
    const key = `${l.tx_date}|${l.amount}`;
    const arr = existingByDateAmount.get(key);
    if (arr) arr.push(l.description);
    else existingByDateAmount.set(key, [l.description]);
  }
  const nextOrderStart = (existing ?? []).reduce((max, l) => Math.max(max, l.statement_order), -1) + 1;

  const rows = valid
    .filter((l) => {
      const desc = l.description.trim() || "—";
      const candidates = existingByDateAmount.get(`${l.date}|${l.amount}`) ?? [];
      return !candidates.some((c) => sameStatementLine(c, desc));
    })
    .map((l, i) => ({
      tx_date: l.date,
      description: l.description.trim() || "—",
      amount: l.amount,
      statement_order: nextOrderStart + i,
      line_type: l.line_type,
      created_by: profile.id,
    }));

  if (rows.length === 0) {
    revalidateAll();
    return;
  }

  const { data: inserted, error } = await supabase.from("mys_bank_statement_lines").insert(rows).select("*");
  if (error) throw new Error(error.message);

  await autoMatchMysLines(supabase, inserted ?? []);

  revalidateAll();
}

// Corrects an existing mys_expenses row's date/amount/description - either
// to adopt what a scanned statement line actually shows, or as a plain
// quick-edit of a record that turned up as a gap with no statement line at
// all. When lineId is given it also links the expense to that line.
export async function adoptMysStatementLineIntoExpense(
  lineId: string | null,
  expenseId: string,
  updates: { tx_date?: string; amount?: number; description?: string }
) {
  await requireManagement();
  const supabase = await createClient();

  // Adopting a statement line resolves the gap that got the expense
  // archived in the first place (if it was), so it must come back into the
  // regular view/reports here - see the identical comment in
  // adoptStatementLineIntoRecord.
  const linkField = lineId ? { bank_statement_line_id: lineId, archived_at: null } : {};

  const { error } = await supabase
    .from("mys_expenses")
    .update({
      ...linkField,
      ...(updates.tx_date ? { expense_date: updates.tx_date } : {}),
      ...(updates.amount !== undefined ? { amount: updates.amount } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
    })
    .eq("id", expenseId);

  if (error) throw new Error(error.message);
  revalidateAll();
}

// Pulls an expense out of the "not found on statement" list and out of
// every financial total/report, WITHOUT deleting it - same archive/restore
// pattern as archiveReconciliationRecord.
export async function archiveMysExpense(expenseId: string) {
  await requireManagement();
  const supabase = await createClient();
  const { error } = await supabase.from("mys_expenses").update({ archived_at: new Date().toISOString() }).eq("id", expenseId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function unarchiveMysExpense(expenseId: string) {
  await requireManagement();
  const supabase = await createClient();
  const { error } = await supabase.from("mys_expenses").update({ archived_at: null }).eq("id", expenseId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// One-click "apply the statement's suggested date" from the flag badge on
// the main MYS Expenses list - mirrors updateExpenseDateOnly (expenses.ts).
export async function updateMysExpenseDateOnly(expenseId: string, newDate: string) {
  await requireManagement();
  const supabase = await createClient();
  const { error } = await supabase.from("mys_expenses").update({ expense_date: newDate }).eq("id", expenseId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteMysBankStatementFile(fileId: string) {
  await requireManagement();
  const supabase = await createClient();
  const { data: existing } = await supabase.from("mys_bank_statement_files").select("file_path").eq("id", fileId).single();
  const { error } = await supabase.from("mys_bank_statement_files").delete().eq("id", fileId);
  if (error) throw new Error(error.message);
  if (existing?.file_path) await supabase.storage.from("bank-statements").remove([existing.file_path]);
  revalidateAll();
}

// Renames the saved statement's display label only - the underlying storage
// object/path stays exactly where it is.
export async function renameMysBankStatementFile(fileId: string, fileName: string) {
  const trimmed = fileName.trim();
  if (!trimmed) return;
  await requireManagement();
  const supabase = await createClient();
  const { error } = await supabase.from("mys_bank_statement_files").update({ file_name: trimmed }).eq("id", fileId);
  if (error) throw new Error(error.message);
  revalidateAll();
}
