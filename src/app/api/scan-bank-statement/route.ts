import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { reconcile, type AppTxn, type BankTxn, type ReconciliationRecordType } from "@/lib/reconciliation-engine";
import { findAlreadyRecordedIndices } from "@/lib/bank-statement-dedup";
import { extractBankStatementLines, isExcelStatementFile, SUPPORTED_STATEMENT_TYPES } from "@/lib/bank-statement-ocr";
import { importBankStatementLines } from "@/lib/actions/bank-statement";
import type { BankStmtLineType } from "@/lib/types/database";

export const runtime = "nodejs";
// A long statement (many pages/transactions) can genuinely take a while for
// the model to read through - the platform's default serverless timeout is
// short enough to cut that off mid-request, which surfaces to her as a
// generic "couldn't connect" failure even though nothing is actually broken.
export const maxDuration = 300;

type LineMatch = {
  record_id: string;
  record_type: string;
  amount: number;
  date: string;
  mismatch: "date" | "amount" | "cross_type" | "split";
  // Only set for a "split" mismatch: every app record the combo is made of
  // (record_id/amount/date carry just the first one, for backwards-
  // compatible display) - she can't decide whether a split match is right
  // without seeing all of them, not just one representative record.
  splitRecords?: ExistingRecord[];
};
type ExistingRecord = { record_id: string; record_type: string; description: string; amount: number; date: string };
type PreviewStatus = "exact" | "review" | "new";

// Runs every scanned line through the deterministic reconciliation engine
// against everything already in the app for this boat (expenses,
// cash withdrawals, incomes - regardless of whether they're already linked
// to some other bank statement line), so the preview can react before she
// ever imports instead of only revealing this after the fact. AI produced
// the raw `lines` (it can only read text off the document); every status
// below is pure rule-based arithmetic, not an AI judgement call.
async function matchLines(
  boatId: string,
  lines: { date: string; amount: number; description: string; line_type: string }[]
): Promise<{
  lineResults: { status: PreviewStatus; match?: LineMatch; matchCount?: number; isBankFee?: boolean }[];
  unmatchedExisting: ExistingRecord[];
  exactLines: { date: string; amount: number; description: string; line_type: string }[];
}> {
  const supabase = await createClient();
  // Paginated: an unbounded select() silently caps at 1000 rows, and a boat
  // with enough history can exceed that - a truncated fetch here means a
  // real expense/withdrawal/income drops out of the matching pool and this
  // preview reports it as missing even though it genuinely exists.
  //
  // Archived records are fetched separately (no status/date bound needed
  // beyond archived_at itself) and kept out of the padded date window below,
  // same as the bank-reconciliation page - a record often ends up archived
  // precisely because its own date was wrong, so it still has to be
  // reachable by this scan, just not reported as a fresh "not found" gap
  // every time (see the fromArchive check further down).
  const [expenses, cashTx, incomes, archivedExpenses, archivedCashTx, archivedIncomes, existingLines] = await Promise.all([
    fetchAllRows<{
      id: string;
      description: string;
      amount: number;
      expense_date: string | null;
      payment_method: string | null;
      bank_statement_line_id: string | null;
    }>((from, to) =>
      supabase
        .from("expenses")
        .select("id, description, amount, expense_date, payment_method, bank_statement_line_id")
        .eq("boat_id", boatId)
        .eq("status", "approved")
        // A payment-plan header is never itself a matchable transaction -
        // its individual payment rows already are (0072_expense_payment_plans.sql).
        .eq("is_payment_plan", false)
        .is("archived_at", null)
        .range(from, to)
    ),
    fetchAllRows<{ id: string; notes: string | null; amount: number; tx_date: string; bank_statement_line_id: string | null }>(
      (from, to) =>
        supabase
          .from("cash_transactions")
          .select("id, notes, amount, tx_date, bank_statement_line_id")
          .eq("boat_id", boatId)
          .eq("status", "approved")
          .eq("type", "withdrawal")
          .is("archived_at", null)
          .range(from, to)
    ),
    fetchAllRows<{ id: string; source: string; amount: number; income_date: string; bank_statement_line_id: string | null }>(
      (from, to) =>
        supabase
          .from("incomes")
          .select("id, source, amount, income_date, bank_statement_line_id")
          .eq("boat_id", boatId)
          .eq("status", "approved")
          .eq("type", "actual")
          .is("archived_at", null)
          .range(from, to)
    ),
    fetchAllRows<{ id: string; description: string; amount: number; expense_date: string | null; payment_method: string | null }>(
      (from, to) =>
        supabase
          .from("expenses")
          .select("id, description, amount, expense_date, payment_method")
          .eq("boat_id", boatId)
          .eq("status", "approved")
          .eq("is_payment_plan", false)
          .not("archived_at", "is", null)
          .range(from, to)
    ),
    fetchAllRows<{ id: string; notes: string | null; amount: number; tx_date: string }>((from, to) =>
      supabase
        .from("cash_transactions")
        .select("id, notes, amount, tx_date")
        .eq("boat_id", boatId)
        .eq("status", "approved")
        .eq("type", "withdrawal")
        .not("archived_at", "is", null)
        .range(from, to)
    ),
    fetchAllRows<{ id: string; source: string; amount: number; income_date: string }>((from, to) =>
      supabase
        .from("incomes")
        .select("id, source, amount, income_date")
        .eq("boat_id", boatId)
        .eq("status", "approved")
        .eq("type", "actual")
        .not("archived_at", "is", null)
        .range(from, to)
    ),
    // Every bank line already saved for this boat, so a re-scan of an
    // overlapping statement can recognize a line it already recorded (even
    // under a slightly different OCR read of its description - see
    // sameStatementLine) instead of matching it against app records fresh
    // and potentially flagging a stale type/date "mismatch" for something
    // that was already resolved in an earlier scan.
    fetchAllRows<{ tx_date: string; amount: number; description: string }>((from, to) =>
      supabase.from("bank_statement_lines").select("tx_date, amount, description").eq("boat_id", boatId).range(from, to)
    ),
  ]);

  const toAppTxn = (
    e: { id: string; description: string; amount: number; expense_date: string | null; payment_method: string | null },
    fromArchive: boolean
  ): AppTxn => ({
    id: `expense:${e.id}`,
    recordType: "expense" as ReconciliationRecordType,
    date: e.expense_date ?? "",
    amount: e.amount,
    currency: "EUR",
    paymentMethod: e.payment_method,
    description: e.description,
    isCashExcluded: e.payment_method === "cash",
    ...(fromArchive ? { fromArchive: true } : {}),
  });
  const cashToAppTxn = (c: { id: string; notes: string | null; amount: number; tx_date: string }, fromArchive: boolean): AppTxn => ({
    id: `cash_withdrawal:${c.id}`,
    recordType: "cash_withdrawal" as ReconciliationRecordType,
    date: c.tx_date,
    amount: c.amount,
    currency: "EUR",
    description: c.notes ?? "",
    ...(fromArchive ? { fromArchive: true } : {}),
  });
  const incomeToAppTxn = (i: { id: string; source: string; amount: number; income_date: string }, fromArchive: boolean): AppTxn => ({
    id: `income:${i.id}`,
    recordType: "income" as ReconciliationRecordType,
    date: i.income_date,
    amount: i.amount,
    currency: "EUR",
    description: i.source,
    ...(fromArchive ? { fromArchive: true } : {}),
  });

  const appItems: AppTxn[] = [
    ...(expenses ?? []).map((e) => toAppTxn(e, false)),
    ...(cashTx ?? []).map((c) => cashToAppTxn(c, false)),
    ...(incomes ?? []).map((i) => incomeToAppTxn(i, false)),
  ].filter((a) => a.date);
  // A record already linked to a bank_statement_lines row (from an earlier
  // scan) has a confirmed match on file, even when that specific line isn't
  // in THIS scan's own bankItems below (bankItems here only holds lines
  // freshly read this pass, with anything already-recorded excluded - see
  // alreadyRecordedIdx). Without this check, a re-scan of an overlapping
  // statement would correctly recognize most of its lines as already
  // recorded (shrinking bankItems down to just the genuinely new ones), and
  // every already-matched record whose own line got excluded that way would
  // wrongly reappear as "not found on the statement" - confirmed in
  // production (STEPHANIE, Sep 2026).
  const alreadyLinkedIds = new Set([
    ...(expenses ?? []).filter((e) => e.bank_statement_line_id).map((e) => `expense:${e.id}`),
    ...(cashTx ?? []).filter((c) => c.bank_statement_line_id).map((c) => `cash_withdrawal:${c.id}`),
    ...(incomes ?? []).filter((i) => i.bank_statement_line_id).map((i) => `income:${i.id}`),
  ]);
  const archivedAppItems: AppTxn[] = [
    ...(archivedExpenses ?? []).map((e) => toAppTxn(e, true)),
    ...(archivedCashTx ?? []).map((c) => cashToAppTxn(c, true)),
    ...(archivedIncomes ?? []).map((i) => incomeToAppTxn(i, true)),
  ].filter((a) => a.date);

  // Two different date bounds, deliberately not the same:
  // - a PADDED range for the matching candidate pool - a bank line dated
  //   right at the edge of the statement may still genuinely correspond to
  //   an app record a few days beyond it (e.g. a card charge that posted
  //   just after month-end), so matching itself is allowed to look up to
  //   10 days either side.
  // - the EXACT (unpadded) statement span for deciding what's allowed to
  //   be reported as "missing" - an app record outside the statement's own
  //   dates was never going to be on it in the first place, so it must
  //   never be flagged as a gap just because it's a few days away. Padding
  //   only ever helps FIND a match; it never manufactures a false gap.
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
  // Archived items skip this window entirely (same as the bank-reconciliation
  // page) - they were already searched once under the normal date rules and
  // never found a match, so re-applying that same window here would just
  // repeat the mistake instead of letting a later statement resolve them.
  const appItemsForMatch = [...appItems.filter((a) => a.date >= paddedMin && a.date <= paddedMax), ...archivedAppItems];

  // A line already recorded from an earlier (possibly overlapping) statement
  // scan - same date, same amount, and a description that's the same or a
  // prefix/extension of one already on file - is not a new transaction to
  // review, it's the same real one read again. Matching it against app
  // records fresh here would risk a stale/spurious "type mismatch" for
  // something that was already resolved correctly the first time; treating
  // it as already-recorded up front and keeping it out of the app-matching
  // pass entirely avoids that.
  const alreadyRecordedIdx = findAlreadyRecordedIndices(lines, existingLines ?? []);
  const lineResults: { status: PreviewStatus; match?: LineMatch; matchCount?: number; isBankFee?: boolean }[] = lines.map((_, i) => ({
    status: alreadyRecordedIdx.has(i) ? "exact" : "new",
  }));

  const bankItems: BankTxn[] = lines
    .map((l, i) => ({
      id: String(i),
      recordType: (l.line_type === "expense" || l.line_type === "cash_withdrawal" || l.line_type === "income"
        ? l.line_type
        : "expense") as ReconciliationRecordType,
      date: l.date,
      amount: l.amount,
      currency: "EUR",
      description: l.description ?? "",
    }))
    .filter((_, i) => !alreadyRecordedIdx.has(i));

  const results = reconcile(bankItems, appItemsForMatch);

  const toRecord = (a: AppTxn): ExistingRecord => ({
    record_id: a.id.slice(a.id.indexOf(":") + 1),
    record_type: a.recordType,
    description: a.description,
    amount: a.amount,
    date: a.date,
  });

  const unmatchedExisting: ExistingRecord[] = [];

  for (const r of results) {
    if (r.status === "excluded_cash") continue; // never surfaced in the scan preview

    if (r.bankItems.length === 0) {
      // missing_in_bank / possible_duplicate with no bank-side counterpart:
      // an existing app record with nothing corresponding to it on this
      // statement at all. Only ever reported when the record's own date
      // falls within the statement's exact span - one pulled in purely by
      // the padded matching window must not be shown as a false gap. An
      // archived record is deliberately excluded here even when it matches
      // that condition - she already set it aside once, so nagging her with
      // it again on every new scan would defeat the point of archiving it.
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
      const first = r.appItems[0];
      lineResults[bankIdx] = {
        status: "review",
        matchCount: r.appItems.length,
        match: first ? { ...toRecord(first), mismatch: "split", splitRecords: r.appItems.map(toRecord) } : undefined,
      };
    } else {
      // likely_match / needs_review, always exactly one bank + one app item
      const app = r.appItems[0];
      const mismatch: LineMatch["mismatch"] =
        app.recordType !== r.bankItems[0].recordType
          ? "cross_type"
          : round2Local(app.amount) !== round2Local(r.bankItems[0].amount)
            ? "amount"
            : "date";
      lineResults[bankIdx] = { status: "review", match: { ...toRecord(app), mismatch } };
    }
  }

  // Lines the engine found an exact (same amount, same date) counterpart
  // for aren't shown to her for review at all - there's nothing to decide.
  // But that exact match still has to be SAVED as a bank_statement_lines
  // row and linked to the record it matches, or this statement's own
  // reconciliation page (which recomputes purely from what's actually
  // persisted, not from this one-time scan result) would have no bank line
  // to pair that record with and wrongly report it as missing - even
  // though it's exactly the case that was just confirmed to be fine.
  const exactLines = lines.filter((_, i) => lineResults[i].status === "exact");

  return { lineResults, unmatchedExisting, exactLines };
}

function round2Local(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function POST(request: Request) {
  const profile = await requireProfile();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "סריקת תדפיסים לא מוגדרת (חסר מפתח API בשרת)" }, { status: 501 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const boatId = String(formData.get("boat_id") ?? "");
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

  // Save the original file itself, not just the AI-extracted lines, so it
  // can be reopened later - the extracted data is only ever as good as
  // whatever the AI managed to read, but the source file is the ground
  // truth she may need to go back to. Best-effort: a storage hiccup here
  // must never block the actual scan she's waiting on. Skipped entirely
  // when re-scanning a statement that's already saved - it already has its
  // own storage object and bank_statement_files row, so saving again here
  // would just leave a duplicate copy behind.
  if (boatId && !skipSave) {
    try {
      const supabase = await createClient();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const storagePath = `${boatId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage.from("bank-statements").upload(storagePath, bytes, {
        contentType: file.type || undefined,
      });
      if (!uploadError) {
        await supabase.from("bank_statement_files").insert({
          boat_id: boatId,
          file_path: storagePath,
          file_name: statementName || file.name,
          uploaded_by: profile.id,
        });
      }
    } catch (e) {
      console.error("scan-bank-statement: failed to archive uploaded file", e);
    }
  }

  // File handling + the AI OCR call + deterministic classification are
  // boat-agnostic and shared with the MYS-scoped scan route - see
  // src/lib/bank-statement-ocr.ts.
  const extraction = await extractBankStatementLines(bytes, file.type, isExcel);
  if ("error" in extraction) {
    return NextResponse.json({ error: extraction.error }, { status: extraction.status });
  }
  const lines = extraction.lines;

  try {
    let resultLines: unknown[] = lines;
    let unmatchedExisting: ExistingRecord[] | undefined;
    let exactCount = 0;
    if (boatId && lines.length > 0) {
      const { lineResults, unmatchedExisting: um, exactLines } = await matchLines(boatId, lines);
      // A bank fee is always paid straight out of the account, never "by
      // card" as its own purchase - the fixed bank_transfer default the UI
      // applies for isBankFee lines must win over whatever the wording-based
      // classifier above guessed for this same description.
      const withMatches = lines.map((l, i) => ({
        ...l,
        ...lineResults[i],
        payment_method: lineResults[i].isBankFee ? undefined : l.payment_method,
      }));
      exactCount = withMatches.filter((l) => l.status === "exact").length;
      resultLines = withMatches.filter((l) => l.status !== "exact");
      unmatchedExisting = um;
      // Persist exact matches now, regardless of whether she does anything
      // else with this scan (including the case where EVERY line was an
      // exact match and resultLines ends up empty) - see the comment on
      // exactLines in matchLines() for why this can't just be skipped.
      if (exactLines.length > 0) {
        try {
          await importBankStatementLines(
            boatId,
            exactLines.map((l) => ({ ...l, line_type: l.line_type as BankStmtLineType }))
          );
        } catch (e) {
          console.error("scan-bank-statement: failed to save exact-match lines", e);
        }
      }
    }
    return NextResponse.json({
      result: { lines: resultLines, unmatched_existing: unmatchedExisting, exact_match_count: exactCount },
    });
  } catch (e) {
    console.error("scan-bank-statement: matching against existing records failed", e);
    return NextResponse.json({ error: "אירעה שגיאה בהתאמת התנועות לרשומות הקיימות" }, { status: 500 });
  }
}
