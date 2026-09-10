import { NextResponse } from "next/server";
import { requireManagement } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { reconcile, type AppTxn, type BankTxn, type ReconciliationRecordType } from "@/lib/reconciliation-engine";
import { findAlreadyRecordedIndices } from "@/lib/bank-statement-dedup";
import { extractBankStatementLines, isExcelStatementFile, SUPPORTED_STATEMENT_TYPES } from "@/lib/bank-statement-ocr";
import { importMysBankStatementLines } from "@/lib/actions/mys-bank-statement";
import type { BankStmtLineType } from "@/lib/types/database";

// MYS's own bank statement scan - mirrors src/app/api/scan-bank-statement/route.ts
// (boats), scoped to mys_expenses only instead of a boat's three ledgers, and
// with no boat_id form field at all (management-only, company-level upload).
// See supabase/migrations/0078_mys_bank_reconciliation.sql for the schema
// this matches against.

export const runtime = "nodejs";
export const maxDuration = 300;

type LineMatch = {
  record_id: string;
  record_type: "expense";
  amount: number;
  date: string;
  mismatch: "date" | "amount";
};
type ExistingRecord = {
  record_id: string;
  record_type: "expense";
  description: string;
  amount: number;
  date: string;
  receipt_path: string | null;
};
type PreviewStatus = "exact" | "review" | "new";

// Runs every scanned line through the deterministic reconciliation engine
// against every mys_expenses row (regardless of whether it's already linked
// to some other statement line), so the preview can react before she ever
// imports. Every status below is pure rule-based arithmetic, not an AI
// judgement call - see the identical comment on the boat route's matchLines.
async function matchLines(lines: { date: string; amount: number; description: string; line_type: string }[]): Promise<{
  lineResults: { status: PreviewStatus; match?: LineMatch; isBankFee?: boolean }[];
  unmatchedExisting: ExistingRecord[];
  exactLines: { date: string; amount: number; description: string; line_type: string }[];
}> {
  const supabase = await createClient();
  const [expenses, archivedExpenses, existingLines] = await Promise.all([
    fetchAllRows<{
      id: string;
      description: string;
      amount: number;
      expense_date: string;
      payment_method: string | null;
      bank_statement_line_id: string | null;
      receipt_path: string | null;
    }>((from, to) =>
      supabase
        .from("mys_expenses")
        .select("id, description, amount, expense_date, payment_method, bank_statement_line_id, receipt_path")
        .is("archived_at", null)
        .range(from, to)
    ),
    fetchAllRows<{
      id: string;
      description: string;
      amount: number;
      expense_date: string;
      payment_method: string | null;
      receipt_path: string | null;
    }>((from, to) =>
      supabase
        .from("mys_expenses")
        .select("id, description, amount, expense_date, payment_method, receipt_path")
        .not("archived_at", "is", null)
        .range(from, to)
    ),
    // Every MYS statement line already saved, so a re-scan of an overlapping
    // statement recognizes a line it already recorded instead of matching it
    // fresh and potentially producing a spurious "mismatch" - see
    // sameStatementLine / the identical comment on the boat route.
    fetchAllRows<{ tx_date: string; amount: number; description: string }>((from, to) =>
      supabase.from("mys_bank_statement_lines").select("tx_date, amount, description").range(from, to)
    ),
  ]);

  const toAppTxn = (
    e: { id: string; description: string; amount: number; expense_date: string; payment_method: string | null },
    fromArchive: boolean
  ): AppTxn => ({
    id: `expense:${e.id}`,
    recordType: "expense" as ReconciliationRecordType,
    date: e.expense_date,
    amount: e.amount,
    currency: "EUR",
    paymentMethod: e.payment_method,
    description: e.description,
    isCashExcluded: e.payment_method === "cash",
    ...(fromArchive ? { fromArchive: true } : {}),
  });

  // AppTxn (the engine's own type) has no room for a field as MYS-specific
  // as a receipt path, so it's carried alongside via this id->path map
  // instead - toRecord() below looks it up when building the gap-list rows
  // the UI needs it for (deleting an expense record has to also clean up
  // its receipt from storage, same as deleteMysExpense already does).
  const receiptByExpenseId = new Map<string, string | null>();
  for (const e of [...(expenses ?? []), ...(archivedExpenses ?? [])]) receiptByExpenseId.set(e.id, e.receipt_path);

  const appItems: AppTxn[] = (expenses ?? []).map((e) => toAppTxn(e, false)).filter((a) => a.date);
  const alreadyLinkedIds = new Set((expenses ?? []).filter((e) => e.bank_statement_line_id).map((e) => `expense:${e.id}`));
  const archivedAppItems: AppTxn[] = (archivedExpenses ?? []).map((e) => toAppTxn(e, true)).filter((a) => a.date);

  const statementDates = lines.map((l) => l.date).sort();
  const exactMin = statementDates[0];
  const exactMax = statementDates[statementDates.length - 1];
  const padded = (iso: string, days: number) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const paddedMin = padded(exactMin, -10);
  const paddedMax = padded(exactMax, 10);
  const appItemsForMatch = [...appItems.filter((a) => a.date >= paddedMin && a.date <= paddedMax), ...archivedAppItems];

  const alreadyRecordedIdx = findAlreadyRecordedIndices(lines, existingLines ?? []);
  const lineResults: { status: PreviewStatus; match?: LineMatch; isBankFee?: boolean }[] = lines.map((_, i) => ({
    status: alreadyRecordedIdx.has(i) ? "exact" : "new",
  }));

  // Only "expense" lines have anything to match against (v1 scope is
  // mys_expenses only) - an income/cash_withdrawal-typed line is left as
  // "new" with nothing to reconcile it to, same as the boat route treats a
  // record type it has no ledger for.
  const bankItems: BankTxn[] = lines
    .map((l, i) => ({
      id: String(i),
      recordType: "expense" as ReconciliationRecordType,
      date: l.date,
      amount: l.amount,
      currency: "EUR",
      description: l.description ?? "",
    }))
    .filter((_, i) => !alreadyRecordedIdx.has(i) && lines[i].line_type === "expense");

  const results = reconcile(bankItems, appItemsForMatch);

  const toRecord = (a: AppTxn): ExistingRecord => {
    const recordId = a.id.slice(a.id.indexOf(":") + 1);
    return {
      record_id: recordId,
      record_type: "expense",
      description: a.description,
      amount: a.amount,
      date: a.date,
      receipt_path: receiptByExpenseId.get(recordId) ?? null,
    };
  };

  const unmatchedExisting: ExistingRecord[] = [];

  for (const r of results) {
    if (r.status === "excluded_cash") continue;

    if (r.bankItems.length === 0) {
      if (r.status === "missing_in_bank" || r.status === "possible_duplicate") {
        for (const a of r.appItems) {
          if (!a.fromArchive && !alreadyLinkedIds.has(a.id) && a.date >= exactMin && a.date <= exactMax) unmatchedExisting.push(toRecord(a));
        }
      }
      continue;
    }

    const bankIdx = Number(r.bankItems[0].id);
    if (r.status === "matched") {
      lineResults[bankIdx] = { status: "exact" };
    } else if (r.status === "bank_fee") {
      lineResults[bankIdx] = { status: "new", isBankFee: true };
    } else if (r.status === "missing_in_app") {
      lineResults[bankIdx] = { status: "new" };
    } else if (r.status === "possible_split_match") {
      // No split-expense concept on the MYS side (unlike a boat's expenses),
      // so a split candidate here is just treated as a plain review match on
      // its first app item rather than surfacing the multi-record picker the
      // boat UI has.
      const first = r.appItems[0];
      lineResults[bankIdx] = first ? { status: "review", match: { ...toRecord(first), mismatch: "amount" } } : { status: "new" };
    } else {
      // likely_match / needs_review, always exactly one bank + one app item
      const app = r.appItems[0];
      const mismatch: LineMatch["mismatch"] = round2Local(app.amount) !== round2Local(r.bankItems[0].amount) ? "amount" : "date";
      lineResults[bankIdx] = { status: "review", match: { ...toRecord(app), mismatch } };
    }
  }

  const exactLines = lines.filter((_, i) => lineResults[i].status === "exact");

  return { lineResults, unmatchedExisting, exactLines };
}

function round2Local(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function POST(request: Request) {
  const profile = await requireManagement();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "סריקת תדפיסים לא מוגדרת (חסר מפתח API בשרת)" }, { status: 501 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const statementName = String(formData.get("statement_name") ?? "").trim();
  const skipSave = formData.get("skip_save") === "1";
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  }
  const isExcel = isExcelStatementFile(file);
  if (!SUPPORTED_STATEMENT_TYPES.has(file.type) && !isExcel) {
    return NextResponse.json({ error: "פורמט קובץ לא נתמך" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Save the original file, same best-effort archive-to-storage as the boat
  // route - under a "mys/" prefix in the same shared "bank-statements"
  // bucket instead of a boat_id one (see 0078's header comment on why no
  // bucket/policy change was needed).
  if (!skipSave) {
    try {
      const supabase = await createClient();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const storagePath = `mys/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage.from("bank-statements").upload(storagePath, bytes, {
        contentType: file.type || undefined,
      });
      if (!uploadError) {
        await supabase.from("mys_bank_statement_files").insert({
          file_path: storagePath,
          file_name: statementName || file.name,
          uploaded_by: profile.id,
        });
      }
    } catch (e) {
      console.error("scan-mys-bank-statement: failed to archive uploaded file", e);
    }
  }

  const extraction = await extractBankStatementLines(bytes, file.type, isExcel);
  if ("error" in extraction) {
    return NextResponse.json({ error: extraction.error }, { status: extraction.status });
  }
  const lines = extraction.lines;

  try {
    let resultLines: unknown[] = lines;
    let unmatchedExisting: ExistingRecord[] | undefined;
    let exactCount = 0;
    if (lines.length > 0) {
      const { lineResults, unmatchedExisting: um, exactLines } = await matchLines(lines);
      const withMatches = lines.map((l, i) => ({
        ...l,
        ...lineResults[i],
        payment_method: lineResults[i].isBankFee ? undefined : l.payment_method,
      }));
      exactCount = withMatches.filter((l) => l.status === "exact").length;
      resultLines = withMatches.filter((l) => l.status !== "exact");
      unmatchedExisting = um;
      if (exactLines.length > 0) {
        try {
          await importMysBankStatementLines(exactLines.map((l) => ({ ...l, line_type: l.line_type as BankStmtLineType })));
        } catch (e) {
          console.error("scan-mys-bank-statement: failed to save exact-match lines", e);
        }
      }
    }
    return NextResponse.json({
      result: { lines: resultLines, unmatched_existing: unmatchedExisting, exact_match_count: exactCount },
    });
  } catch (e) {
    console.error("scan-mys-bank-statement: matching against existing records failed", e);
    return NextResponse.json({ error: "אירעה שגיאה בהתאמת התנועות לרשומות הקיימות" }, { status: 500 });
  }
}
