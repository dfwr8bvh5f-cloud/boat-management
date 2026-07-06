"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Pencil, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import {
  importBankStatementLines,
  createExpenseFromStatementLine,
  createCashWithdrawalFromStatementLine,
  createIncomeFromStatementLine,
  deleteBankStatementLine,
  updateBankStatementLineType,
  rematchBankStatementLines,
  adoptStatementLineIntoRecord,
  deleteReconciliationRecord,
} from "@/lib/actions/bank-statement";
import { createExpense } from "@/lib/actions/expenses";
import { createCashTransaction } from "@/lib/actions/cash";
import { createIncome } from "@/lib/actions/incomes";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { formatDateDisplay } from "@/lib/date-format";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { useFileDrop } from "@/lib/use-file-drop";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { ReconciliationStatus } from "@/lib/reconciliation-engine";
import type { BankStmtLineType, ExpenseCategory, PaymentMethod } from "@/lib/types/database";

export type ReconItemBankLine = { id: string; lineType: BankStmtLineType; description: string; date: string; amount: number };
export type ReconItemAppRecord = { id: string; recordType: BankStmtLineType; description: string; date: string; amount: number };
export type ReconciliationItem = {
  key: string;
  status: ReconciliationStatus;
  confidence: number;
  bankLines: ReconItemBankLine[];
  appRecords: ReconItemAppRecord[];
  differenceAmount: number;
  notes: string;
};

type ScanMatch = {
  record_id: string;
  record_type: BankStmtLineType;
  amount: number;
  date: string;
  mismatch: "date" | "amount" | "cross_type" | "split";
};
type ScanUnmatchedExisting = { record_id: string; record_type: BankStmtLineType; description: string; amount: number; date: string };
type ParsedLine = {
  date: string;
  description: string;
  amount: number;
  line_type: BankStmtLineType;
  status?: "review" | "new";
  match?: ScanMatch;
  matchCount?: number;
  category?: ExpenseCategory;
  payment_method?: PaymentMethod;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ExpenseReconciliationFlag = {
  type: "date_mismatch" | "amount_mismatch" | "missing";
  suggestedDate?: string;
};

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export function BankReconciliationManager({
  boatId,
  reconciliationItems,
  categories,
  categoryLabels,
  paymentLabels,
  canEdit,
  locale,
  onExpenseFlagsChange,
}: {
  boatId: string;
  reconciliationItems: ReconciliationItem[];
  categories: ExpenseCategory[];
  categoryLabels: Record<ExpenseCategory, string>;
  paymentLabels: Record<PaymentMethod, string>;
  canEdit: boolean;
  locale: Locale;
  onExpenseFlagsChange?: (flags: Record<string, ExpenseReconciliationFlag>) => void;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedLines, setParsedLines] = useState<ParsedLine[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [expenseFormLineId, setExpenseFormLineId] = useState<string | null>(null);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);
  const [exactMatchCount, setExactMatchCount] = useState(0);
  const [scanUnmatchedExisting, setScanUnmatchedExisting] = useState<ScanUnmatchedExisting[]>([]);
  const [editingGapId, setEditingGapId] = useState<string | null>(null);

  // Surfaces the same "date/amount doesn't match the bank" and "not found
  // on the statement at all" findings directly on the expense records
  // themselves (via the parent's expenses side panel), instead of only in
  // this reconciliation view - she wants the discrepancies visible right
  // on the expense she'd otherwise have to hunt down separately.
  useEffect(() => {
    if (!onExpenseFlagsChange) return;
    const dayDiff = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

    const flags: Record<string, ExpenseReconciliationFlag> = {};
    for (const l of parsedLines ?? []) {
      if (l.status === "review" && l.match?.record_type === "expense" && (l.match.mismatch === "date" || l.match.mismatch === "amount")) {
        const type = l.match.mismatch === "date" ? "date_mismatch" : "amount_mismatch";
        flags[l.match.record_id] = { type, suggestedDate: type === "date_mismatch" ? l.date : undefined };
      }
    }
    // A record with no match at all: check whether a scanned line with the
    // exact same amount showed up within ten days either way - if so, it's
    // very likely the same transaction on a different date, worth a
    // one-click fix rather than treating it as a plain gap.
    for (const r of scanUnmatchedExisting) {
      if (r.record_type !== "expense") continue;
      const candidates = (parsedLines ?? []).filter(
        (l) => l.line_type === "expense" && l.amount === r.amount && l.date !== r.date && dayDiff(l.date, r.date) <= 10
      );
      const closest = candidates.length
        ? candidates.reduce((best, l) => (dayDiff(l.date, r.date) < dayDiff(best.date, r.date) ? l : best))
        : null;
      flags[r.record_id] = { type: "missing", suggestedDate: closest?.date };
    }
    // The already-persisted reconciliation view runs the same engine over
    // everything in the database, so its findings get surfaced the same way.
    for (const item of reconciliationItems) {
      const app = item.appRecords[0];
      if (!app || app.recordType !== "expense") continue;
      if ((item.status === "needs_review" || item.status === "likely_match") && item.bankLines.length === 1 && item.appRecords.length === 1) {
        const bank = item.bankLines[0];
        const type = round2(bank.amount) !== round2(app.amount) ? "amount_mismatch" : "date_mismatch";
        flags[app.id] = { type, suggestedDate: type === "date_mismatch" ? bank.date : undefined };
      } else if (item.status === "missing_in_bank") {
        flags[app.id] = { type: "missing" };
      }
    }
    onExpenseFlagsChange(flags);
  }, [parsedLines, scanUnmatchedExisting, reconciliationItems, onExpenseFlagsChange]);

  const lineTypeLabels: Record<BankStmtLineType, string> = {
    expense: t("bank_stmt_type_expense"),
    cash_withdrawal: t("bank_stmt_type_cash_withdrawal"),
    income: t("bank_stmt_type_income"),
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setScanError(null);
    setParsedLines(null);
    setExactMatchCount(0);
    setScanUnmatchedExisting([]);
    if (file.size > MAX_SCAN_FILE_BYTES) {
      setScanError(t("scan_file_too_large"));
      return;
    }
    setScanning(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("boat_id", boatId);
      const res = await fetch("/api/scan-bank-statement", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanError(data.error ?? t("scan_fail"));
        return;
      }
      const lines: ParsedLine[] = data.result?.lines ?? [];
      const exactCount: number = data.result?.exact_match_count ?? 0;
      const unmatchedExisting: ScanUnmatchedExisting[] = data.result?.unmatched_existing ?? [];
      setScanUnmatchedExisting(unmatchedExisting);
      if (lines.length === 0) {
        setScanError(exactCount > 0 ? t("bank_stmt_all_already_recorded", { count: exactCount }) : t("bank_stmt_no_lines_found"));
        return;
      }
      setParsedLines(lines);
      setExactMatchCount(exactCount);
    } catch {
      setScanError(t("scan_connect_fail"));
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const acceptScanCorrection = (i: number) =>
    runQuickAction(`preview-${i}`, async () => {
      const l = parsedLines?.[i];
      if (!l?.match) return;
      await adoptStatementLineIntoRecord(boatId, null, l.match.record_type, l.match.record_id, { tx_date: l.date, amount: l.amount });
      removeParsedLine(i);
    });

  const { dragging, dropHandlers } = useFileDrop(onFile);

  const removeParsedLine = (i: number) => setParsedLines((ls) => (ls ? ls.filter((_, idx) => idx !== i) : ls));
  const setParsedLineType = (i: number, line_type: BankStmtLineType) =>
    setParsedLines((ls) => (ls ? ls.map((l, idx) => (idx === i ? { ...l, line_type } : l)) : ls));
  const setParsedLineDate = (i: number, date: string) =>
    setParsedLines((ls) => (ls ? ls.map((l, idx) => (idx === i ? { ...l, date } : l)) : ls));
  const setParsedLineDescription = (i: number, description: string) =>
    setParsedLines((ls) => (ls ? ls.map((l, idx) => (idx === i ? { ...l, description } : l)) : ls));
  const setParsedLineAmount = (i: number, amount: number) =>
    setParsedLines((ls) => (ls ? ls.map((l, idx) => (idx === i ? { ...l, amount } : l)) : ls));
  const setParsedLineCategory = (i: number, category: ExpenseCategory) =>
    setParsedLines((ls) => (ls ? ls.map((l, idx) => (idx === i ? { ...l, category } : l)) : ls));
  const setParsedLinePaymentMethod = (i: number, payment_method: PaymentMethod) =>
    setParsedLines((ls) => (ls ? ls.map((l, idx) => (idx === i ? { ...l, payment_method } : l)) : ls));

  // Creates the real record straight from the preview row - skips the
  // intermediate "import the raw line, then separately add a record from
  // the reconciliation page" round trip for a transaction she's already
  // reviewed and wants to file right now.
  const acceptNewLine = (i: number) =>
    runQuickAction(`new-${i}`, async () => {
      const l = parsedLines?.[i];
      if (!l) return;
      if (l.line_type === "expense") {
        const fd = new FormData();
        fd.set("description", l.description);
        fd.set("amount", String(l.amount));
        fd.set("category", l.category ?? "other");
        fd.set("payment_method", l.payment_method ?? "card");
        fd.set("expense_date", l.date);
        await createExpense(boatId, fd);
      } else if (l.line_type === "cash_withdrawal") {
        const fd = new FormData();
        fd.set("type", "withdrawal");
        fd.set("amount", String(l.amount));
        fd.set("tx_date", l.date);
        fd.set("notes", l.description);
        await createCashTransaction(boatId, fd);
      } else {
        const fd = new FormData();
        fd.set("source", l.description);
        fd.set("amount", String(l.amount));
        fd.set("income_date", l.date);
        await createIncome(boatId, "actual", fd);
      }
      removeParsedLine(i);
    });

  const runQuickAction = async (lineId: string, fn: () => Promise<void>) => {
    setBusyLineId(lineId);
    try {
      await fn();
    } finally {
      setBusyLineId(null);
    }
  };

  const [editingRecordKey, setEditingRecordKey] = useState<string | null>(null);
  const [dismissedItemKeys, setDismissedItemKeys] = useState<Set<string>>(new Set());
  const [selectedReviewKeys, setSelectedReviewKeys] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);
  const visibleItems = reconciliationItems.filter((item) => !dismissedItemKeys.has(item.key));

  const mismatchFor = (bank: ReconItemBankLine, app: ReconItemAppRecord): ScanMatch["mismatch"] =>
    bank.lineType !== app.recordType ? "cross_type" : round2(bank.amount) !== round2(app.amount) ? "amount" : "date";

  const applyReviewItem = (item: ReconciliationItem) => {
    const bank = item.bankLines[0];
    const app = item.appRecords[0];
    const mismatch = mismatchFor(bank, app);
    return adoptStatementLineIntoRecord(
      boatId,
      bank.id,
      app.recordType,
      app.id,
      mismatch === "amount" ? { amount: bank.amount } : { tx_date: bank.date }
    );
  };

  const toggleReviewSelected = (key: string) =>
    setSelectedReviewKeys((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const byStatus = <S extends ReconciliationStatus>(status: S) => visibleItems.filter((item) => item.status === status);
  const reviewItems = [...byStatus("needs_review"), ...byStatus("likely_match")];
  const missingInAppItems = byStatus("missing_in_app");
  const missingInBankItems = byStatus("missing_in_bank");
  const duplicateItems = byStatus("possible_duplicate");
  const splitItems = byStatus("possible_split_match");
  const matchedItems = byStatus("matched");
  const bankFeeItems = byStatus("bank_fee");

  const statusLabels: Record<ReconciliationStatus, string> = {
    matched: t("recon_status_matched"),
    likely_match: t("recon_status_likely_match"),
    needs_review: t("recon_status_needs_review"),
    missing_in_app: t("recon_status_missing_in_app"),
    missing_in_bank: t("recon_status_missing_in_bank"),
    possible_duplicate: t("recon_status_possible_duplicate"),
    possible_split_match: t("recon_status_possible_split_match"),
    bank_fee: t("recon_status_bank_fee"),
    excluded_cash: t("recon_status_excluded_cash"),
  };

  const StatusBadge = ({ status, confidence }: { status: ReconciliationStatus; confidence: number }) => (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        status === "needs_review" || status === "possible_duplicate"
          ? "bg-fleet-coral/10 text-fleet-coral"
          : "bg-fleet-brass/10 text-fleet-brass"
      }`}
    >
      {statusLabels[status]} · {confidence}%
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <div className="rounded-xl border border-dashed border-fleet-brass bg-white p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
            <Upload size={15} className="text-fleet-brass" /> {t("bank_stmt_upload_title")}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            {...dropHandlers}
            className={`relative flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-fleet-navy disabled:opacity-60 ${
              dragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-brass bg-fleet-paper"
            }`}
          >
            <Sparkles size={15} /> {scanning ? t("scanning") : t("bank_stmt_upload_cta")}
            {dragging && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                <Plus size={18} className="text-fleet-teal" />
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          {scanError && <p className="mt-2 text-xs text-fleet-coral">{scanError}</p>}

          {parsedLines && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="text-xs font-bold text-fleet-ink">
                {t("bank_stmt_preview_title", { count: parsedLines.length })}
                {exactMatchCount > 0 && ` · ${t("bank_stmt_already_recorded_count", { count: exactMatchCount })}`}
              </div>
              <div className="flex flex-col gap-1.5">
                {parsedLines.map((l, i) => {
                  const editableFields = (
                    <>
                      <input
                        type="date"
                        value={l.date}
                        onChange={(e) => setParsedLineDate(i, e.target.value)}
                        className="w-32 shrink-0 rounded-md border border-fleet-border bg-white px-1 py-1 text-[11px] text-fleet-ink"
                      />
                      <input
                        value={l.description}
                        onChange={(e) => setParsedLineDescription(i, e.target.value)}
                        className="min-w-24 flex-1 rounded-md border border-fleet-border bg-white px-1.5 py-1 text-[11px]"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={l.amount}
                        onChange={(e) => setParsedLineAmount(i, Number(e.target.value))}
                        className="w-20 rounded-md border border-fleet-border bg-white px-1.5 py-1 text-[11px] font-bold text-fleet-navy"
                      />
                      <select
                        value={l.line_type}
                        onChange={(e) => setParsedLineType(i, e.target.value as BankStmtLineType)}
                        className="rounded-md border border-fleet-border bg-white px-1.5 py-1 text-[11px]"
                      >
                        {(Object.keys(lineTypeLabels) as BankStmtLineType[]).map((k) => (
                          <option key={k} value={k}>
                            {lineTypeLabels[k]}
                          </option>
                        ))}
                      </select>
                      {l.line_type === "expense" && (
                        <>
                          <select
                            value={l.category ?? "other"}
                            onChange={(e) => setParsedLineCategory(i, e.target.value as ExpenseCategory)}
                            className="rounded-md border border-fleet-border bg-white px-1.5 py-1 text-[11px]"
                          >
                            {categories.map((k) => (
                              <option key={k} value={k}>
                                {categoryLabels[k]}
                              </option>
                            ))}
                          </select>
                          <select
                            value={l.payment_method ?? "card"}
                            onChange={(e) => setParsedLinePaymentMethod(i, e.target.value as PaymentMethod)}
                            className="rounded-md border border-fleet-border bg-white px-1.5 py-1 text-[11px]"
                          >
                            {(["card", "bank_transfer"] as const).map((k) => (
                              <option key={k} value={k}>
                                {paymentLabels[k]}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                    </>
                  );

                  const hintKeyByMismatch: Record<ScanMatch["mismatch"], Parameters<typeof t>[0]> = {
                    date: "bank_stmt_date_mismatch_hint",
                    amount: "bank_stmt_amount_mismatch_hint",
                    cross_type: "bank_stmt_cross_type_hint",
                    split: "bank_stmt_split_hint",
                  };

                  return l.status === "review" && l.match ? (
                    <div key={i} className="flex flex-col gap-1.5 rounded-lg bg-fleet-brass/10 p-2.5 text-xs">
                      <p className="text-fleet-brass">
                        {t(hintKeyByMismatch[l.match.mismatch], {
                          date: formatDateDisplay(l.match.date),
                          amount: l.match.amount.toLocaleString("he-IL"),
                          count: l.matchCount ?? 1,
                        })}
                      </p>
                      <div className="flex items-center gap-2 overflow-x-auto">{editableFields}</div>
                      <div className="flex items-center gap-2">
                        {l.match.mismatch !== "split" && (
                          <button
                            type="button"
                            disabled={busyLineId === `preview-${i}`}
                            onClick={() => acceptScanCorrection(i)}
                            className="rounded-full bg-fleet-brass px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                          >
                            {t(l.match.mismatch === "date" ? "recon_accept_date_change" : "bank_stmt_adopt_existing_word")}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyLineId === `new-${i}`}
                          onClick={() => acceptNewLine(i)}
                          className="rounded-full bg-fleet-navy px-2.5 py-1 text-[11px] font-semibold text-fleet-paper hover:opacity-90 disabled:opacity-60"
                        >
                          {t("accept_change_word")}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeParsedLine(i)}
                          aria-label="remove"
                          className="text-fleet-ink hover:text-fleet-coral"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex items-center gap-2 overflow-x-auto rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs">
                      {editableFields}
                      <button
                        type="button"
                        disabled={busyLineId === `new-${i}`}
                        onClick={() => acceptNewLine(i)}
                        className="rounded-full bg-fleet-navy px-2.5 py-1 text-[11px] font-semibold text-fleet-paper hover:opacity-90 disabled:opacity-60"
                      >
                        {t("accept_change_word")}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeParsedLine(i)}
                        aria-label="remove"
                        className="text-fleet-ink hover:text-fleet-coral"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {parsedLines.some((l) => l.status !== "review") && (
                <form
                  action={async () => {
                    const importable = parsedLines.filter((l) => l.status !== "review");
                    setImporting(true);
                    await importBankStatementLines(boatId, importable);
                    setImporting(false);
                    setParsedLines((ls) => (ls ? ls.filter((l) => l.status === "review") : ls));
                  }}
                >
                  <button
                    type="submit"
                    disabled={importing}
                    className="w-full rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {importing
                      ? t("uploading_word")
                      : t("bank_stmt_import_cta", { count: parsedLines.filter((l) => l.status !== "review").length })}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {scanUnmatchedExisting.length > 0 && (
        <div className="rounded-xl border border-dashed border-fleet-coral bg-red-50 p-4">
          <div className="mb-1 text-sm font-bold text-fleet-coral">{t("bank_stmt_scan_gap_title")}</div>
          <p className="mb-2 text-xs text-fleet-ink">{t("bank_stmt_scan_gap_hint")}</p>
          <div className="flex flex-col gap-1.5">
            {scanUnmatchedExisting.map((r) =>
              editingGapId === r.record_id ? (
                <form
                  key={r.record_id}
                  action={async (formData) => {
                    await adoptStatementLineIntoRecord(boatId, null, r.record_type, r.record_id, {
                      description: String(formData.get("description") ?? "").trim(),
                      amount: Number(formData.get("amount") ?? r.amount),
                      tx_date: String(formData.get("tx_date") ?? r.date),
                    });
                    setScanUnmatchedExisting((rs) => rs.filter((x) => x.record_id !== r.record_id));
                    setEditingGapId(null);
                  }}
                  className="flex flex-col gap-1.5 rounded-lg bg-white p-2.5 text-xs"
                >
                  <input name="description" defaultValue={r.description} className={inputClass} />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input name="amount" type="number" step="0.01" defaultValue={r.amount} className={inputClass} />
                    <input name="tx_date" type="date" defaultValue={r.date} className={inputClass} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingGapId(null)}
                      className="flex-1 rounded-lg border border-fleet-border py-1.5 text-xs font-bold text-fleet-ink hover:bg-fleet-paper"
                    >
                      {t("close_word")}
                    </button>
                    <button type="submit" className="flex-1 rounded-lg bg-fleet-teal py-1.5 text-xs font-bold text-white hover:opacity-90">
                      {t("save_word")}
                    </button>
                  </div>
                </form>
              ) : (
                <div key={r.record_id} className="flex items-center gap-3 rounded-lg bg-white p-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{r.description || lineTypeLabels[r.record_type]}</div>
                    <div className="text-fleet-ink" dir="ltr">{formatDateDisplay(r.date)}</div>
                  </div>
                  <div className="shrink-0 font-bold text-fleet-navy">€{r.amount.toLocaleString("he-IL")}</div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditingGapId(r.record_id)}
                      aria-label="edit"
                      className="text-fleet-ink hover:text-fleet-teal"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {canEdit && (
                    <form
                      action={async () => {
                        await deleteReconciliationRecord(boatId, r.record_type, r.record_id);
                        setScanUnmatchedExisting((rs) => rs.filter((x) => x.record_id !== r.record_id));
                      }}
                    >
                      <ConfirmSubmitButton
                        confirmMessage={t("bank_stmt_delete_gap_confirm")}
                        ariaLabel="delete"
                        className="text-fleet-ink hover:text-fleet-coral"
                      >
                        <Trash2 size={14} />
                      </ConfirmSubmitButton>
                    </form>
                  )}
                  <button
                    type="button"
                    onClick={() => setScanUnmatchedExisting((rs) => rs.filter((x) => x.record_id !== r.record_id))}
                    aria-label="dismiss"
                    title={t("bank_stmt_scan_gap_dismiss")}
                    className="text-fleet-ink hover:text-fleet-coral"
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {reviewItems.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-fleet-ink">{t("recon_review_title")}</div>
            {canEdit && (
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-fleet-ink">
                <input
                  type="checkbox"
                  checked={selectedReviewKeys.size > 0 && selectedReviewKeys.size === reviewItems.length}
                  onChange={(e) => setSelectedReviewKeys(e.target.checked ? new Set(reviewItems.map((item) => item.key)) : new Set())}
                  className="h-3.5 w-3.5 rounded border-fleet-border"
                />
                {t("select_all_word")}
              </label>
            )}
          </div>
          {reviewItems.map((item) => {
            const bank = item.bankLines[0];
            const app = item.appRecords[0];
            const mismatch = mismatchFor(bank, app);
            const hintKey = {
              date: "bank_stmt_date_mismatch_hint",
              amount: "bank_stmt_amount_mismatch_hint",
              cross_type: "bank_stmt_cross_type_hint",
              split: "bank_stmt_split_hint",
            }[mismatch] as Parameters<typeof t>[0];
            return (
              <div key={item.key} className="rounded-xl border border-fleet-border bg-white p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  {canEdit && (
                    <input
                      type="checkbox"
                      checked={selectedReviewKeys.has(item.key)}
                      onChange={() => toggleReviewSelected(item.key)}
                      className="h-3.5 w-3.5 shrink-0 rounded border-fleet-border"
                    />
                  )}
                  <StatusBadge status={item.status} confidence={item.confidence} />
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-fleet-ink">{bank.description}</div>
                    <div className="text-fleet-ink/70" dir="ltr">{formatDateDisplay(bank.date)}</div>
                  </div>
                  <div className="shrink-0 font-bold text-fleet-navy">€{bank.amount.toLocaleString("he-IL")}</div>
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-fleet-brass/10 px-2.5 py-1.5 text-xs text-fleet-brass">
                  <span className="flex-1 truncate">{t(hintKey, { date: formatDateDisplay(app.date), amount: app.amount.toLocaleString("he-IL") })}</span>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        disabled={busyLineId === item.key}
                        onClick={() => runQuickAction(item.key, () => applyReviewItem(item))}
                        className="rounded-full bg-fleet-brass px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                      >
                        {t(mismatch === "date" ? "recon_accept_date_change" : "bank_stmt_adopt_existing_word")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedItemKeys((s) => new Set(s).add(item.key))}
                        className="rounded-full border border-fleet-brass px-2.5 py-1 text-[11px] font-semibold text-fleet-brass hover:bg-fleet-brass/10"
                      >
                        {t("reject_change_word")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {canEdit && selectedReviewKeys.size > 0 && (
            <button
              type="button"
              disabled={bulkApplying}
              onClick={async () => {
                setBulkApplying(true);
                const items = reviewItems.filter((item) => selectedReviewKeys.has(item.key));
                await Promise.all(items.map((item) => applyReviewItem(item)));
                setSelectedReviewKeys(new Set());
                setBulkApplying(false);
              }}
              className="w-fit rounded-full bg-fleet-navy px-3.5 py-2 text-xs font-bold text-fleet-paper hover:opacity-90 disabled:opacity-60"
            >
              {bulkApplying ? t("uploading_word") : t("recon_apply_selected", { count: selectedReviewKeys.size })}
            </button>
          )}
        </div>
      )}

      {duplicateItems.length > 0 && (
        <div className="rounded-xl border border-dashed border-fleet-coral bg-red-50 p-4">
          <div className="mb-1 text-sm font-bold text-fleet-coral">{t("recon_duplicate_title")}</div>
          <p className="mb-2 text-xs text-fleet-ink">{t("recon_duplicate_hint")}</p>
          <div className="flex flex-col gap-2">
            {duplicateItems.map((item) => (
              <div key={item.key} className="flex flex-col gap-1.5 rounded-lg bg-white p-2.5 text-xs">
                {item.appRecords.map((r) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{r.description}</div>
                      <div className="text-fleet-ink" dir="ltr">{formatDateDisplay(r.date)}</div>
                    </div>
                    <div className="shrink-0 font-bold text-fleet-navy">€{r.amount.toLocaleString("he-IL")}</div>
                    {canEdit && (
                      <form action={deleteReconciliationRecord.bind(null, boatId, r.recordType, r.id)}>
                        <ConfirmSubmitButton
                          confirmMessage={t("bank_stmt_delete_gap_confirm")}
                          ariaLabel="delete"
                          className="text-fleet-ink hover:text-fleet-coral"
                        >
                          <Trash2 size={14} />
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {splitItems.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold text-fleet-ink">{t("recon_split_title")}</div>
          {splitItems.map((item) => (
            <div key={item.key} className="flex flex-col gap-1.5 rounded-xl border border-fleet-border bg-white p-3 text-xs">
              <StatusBadge status={item.status} confidence={item.confidence} />
              <p className="text-fleet-ink/80">{t("recon_split_hint")}</p>
              {[
                ...item.bankLines.map((b) => ({ id: b.id, description: b.description, date: b.date, amount: b.amount, type: b.lineType })),
                ...item.appRecords.map((a) => ({ id: a.id, description: a.description, date: a.date, amount: a.amount, type: a.recordType })),
              ].map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg bg-fleet-paper px-2 py-1">
                  <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-fleet-ink">{lineTypeLabels[r.type]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{r.description}</div>
                    <div className="text-fleet-ink" dir="ltr">{formatDateDisplay(r.date)}</div>
                  </div>
                  <div className="shrink-0 font-bold text-fleet-navy">€{r.amount.toLocaleString("he-IL")}</div>
                </div>
              ))}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setDismissedItemKeys((s) => new Set(s).add(item.key))}
                  className="mt-1 w-fit rounded-full border border-fleet-border px-2.5 py-1 text-[11px] font-semibold text-fleet-ink hover:bg-fleet-paper"
                >
                  {t("reject_change_word")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {missingInAppItems.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold text-fleet-ink">{t("bank_stmt_unmatched_lines_title")}</div>
          {missingInAppItems.map((item) => {
            const l = item.bankLines[0];
            return (
              <div key={item.key} className="rounded-xl border border-fleet-border bg-white p-3">
                <div className="flex items-center gap-3 overflow-x-auto">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{l.description}</div>
                    <div className="text-xs text-fleet-ink" dir="ltr">{formatDateDisplay(l.date)}</div>
                  </div>
                  <div className="shrink-0 font-bold text-fleet-navy">€{l.amount.toLocaleString("he-IL")}</div>
                  {canEdit && (
                    <>
                      <select
                        value={l.lineType}
                        disabled={busyLineId === l.id}
                        onChange={(e) => runQuickAction(l.id, () => updateBankStatementLineType(boatId, l.id, e.target.value as BankStmtLineType))}
                        className="rounded-md border border-fleet-border bg-white px-1.5 py-1 text-[11px] disabled:opacity-60"
                      >
                        {(Object.keys(lineTypeLabels) as BankStmtLineType[]).map((k) => (
                          <option key={k} value={k}>
                            {lineTypeLabels[k]}
                          </option>
                        ))}
                      </select>
                      {l.lineType === "expense" ? (
                        <button
                          type="button"
                          onClick={() => setExpenseFormLineId((id) => (id === l.id ? null : l.id))}
                          className="rounded-full bg-fleet-navy px-3 py-1.5 text-xs font-semibold text-fleet-paper hover:opacity-90"
                        >
                          + {t("add_expense")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyLineId === l.id}
                          onClick={() =>
                            runQuickAction(l.id, () =>
                              l.lineType === "cash_withdrawal"
                                ? createCashWithdrawalFromStatementLine(boatId, l.id)
                                : createIncomeFromStatementLine(boatId, l.id)
                            )
                          }
                          className="rounded-full bg-fleet-navy px-3 py-1.5 text-xs font-semibold text-fleet-paper hover:opacity-90 disabled:opacity-60"
                        >
                          + {t("bank_stmt_create_record")}
                        </button>
                      )}
                      <form action={deleteBankStatementLine.bind(null, boatId, l.id)}>
                        <ConfirmSubmitButton confirmMessage={t("bank_stmt_delete_line_confirm")} className="text-fleet-ink hover:text-fleet-coral">
                          <Trash2 size={15} />
                        </ConfirmSubmitButton>
                      </form>
                    </>
                  )}
                </div>
                {expenseFormLineId === l.id && (
                  <form
                    action={async (formData) => {
                      await createExpenseFromStatementLine(boatId, l.id, formData);
                      setExpenseFormLineId(null);
                    }}
                    className="mt-2.5 flex flex-col gap-2 border-t border-dashed border-fleet-border pt-2.5"
                  >
                    <input name="description" defaultValue={l.description} placeholder={t("description")} className={inputClass} />
                    <div className="grid grid-cols-2 gap-2">
                      <select name="category" defaultValue="other" className={inputClass}>
                        {categories.map((k) => (
                          <option key={k} value={k}>
                            {categoryLabels[k]}
                          </option>
                        ))}
                      </select>
                      <select name="payment_method" defaultValue="card" className={inputClass}>
                        {(["card", "bank_transfer"] as const).map((k) => (
                          <option key={k} value={k}>
                            {paymentLabels[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input name="notes" placeholder={t("note")} className={inputClass} />
                    <button type="submit" className="rounded-lg bg-fleet-teal py-2 text-sm font-bold text-white hover:opacity-90">
                      {t("save_word")}
                    </button>
                  </form>
                )}
              </div>
            );
          })}
          {canEdit && (
            <button
              type="button"
              disabled={rematching}
              onClick={async () => {
                setRematching(true);
                await rematchBankStatementLines(boatId);
                setRematching(false);
              }}
              className="w-fit rounded-full bg-fleet-navy px-3 py-1.5 text-xs font-semibold text-fleet-paper hover:opacity-90 disabled:opacity-60"
            >
              {rematching ? t("uploading_word") : t("bank_stmt_rematch_cta")}
            </button>
          )}
        </div>
      )}

      {missingInBankItems.length > 0 && (
        <div className="rounded-xl border border-dashed border-fleet-coral bg-red-50 p-4">
          <div className="mb-1 text-sm font-bold text-fleet-coral">{t("bank_stmt_scan_gap_title")}</div>
          <p className="mb-2 text-xs text-fleet-ink">{t("bank_stmt_scan_gap_hint")}</p>
          <div className="flex flex-col gap-1.5">
            {missingInBankItems.map((item) => {
              const r = item.appRecords[0];
              return editingRecordKey === item.key ? (
                <form
                  key={item.key}
                  action={async (formData) => {
                    await adoptStatementLineIntoRecord(boatId, null, r.recordType, r.id, {
                      description: String(formData.get("description") ?? "").trim(),
                      amount: Number(formData.get("amount") ?? r.amount),
                      tx_date: String(formData.get("tx_date") ?? r.date),
                    });
                    setEditingRecordKey(null);
                  }}
                  className="flex flex-col gap-1.5 rounded-lg bg-white p-2.5 text-xs"
                >
                  <input name="description" defaultValue={r.description} className={inputClass} />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input name="amount" type="number" step="0.01" defaultValue={r.amount} className={inputClass} />
                    <input name="tx_date" type="date" defaultValue={r.date} className={inputClass} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingRecordKey(null)}
                      className="flex-1 rounded-lg border border-fleet-border py-1.5 text-xs font-bold text-fleet-ink hover:bg-fleet-paper"
                    >
                      {t("close_word")}
                    </button>
                    <button type="submit" className="flex-1 rounded-lg bg-fleet-teal py-1.5 text-xs font-bold text-white hover:opacity-90">
                      {t("save_word")}
                    </button>
                  </div>
                </form>
              ) : (
                <div key={item.key} className="flex items-center gap-3 rounded-lg bg-white p-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{r.description || lineTypeLabels[r.recordType]}</div>
                    <div className="text-fleet-ink" dir="ltr">{formatDateDisplay(r.date)}</div>
                  </div>
                  <div className="shrink-0 font-bold text-fleet-navy">€{r.amount.toLocaleString("he-IL")}</div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditingRecordKey(item.key)}
                      aria-label="edit"
                      className="text-fleet-ink hover:text-fleet-teal"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {canEdit && (
                    <form action={deleteReconciliationRecord.bind(null, boatId, r.recordType, r.id)}>
                      <ConfirmSubmitButton
                        confirmMessage={t("bank_stmt_delete_gap_confirm")}
                        ariaLabel="delete"
                        className="text-fleet-ink hover:text-fleet-coral"
                      >
                        <Trash2 size={14} />
                      </ConfirmSubmitButton>
                    </form>
                  )}
                  <button
                    type="button"
                    onClick={() => setDismissedItemKeys((s) => new Set(s).add(item.key))}
                    aria-label="dismiss"
                    title={t("bank_stmt_scan_gap_dismiss")}
                    className="text-fleet-ink hover:text-fleet-coral"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {matchedItems.length > 0 && (
        <details className="rounded-xl border border-fleet-border bg-white p-3">
          <summary className="cursor-pointer text-xs font-bold text-fleet-moss">{t("bank_stmt_matched_title", { count: matchedItems.length })}</summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {matchedItems.map((item) => {
              const l = item.bankLines[0];
              return (
                <div key={item.key} className="flex items-center gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs">
                  <CheckCircle2 size={13} className="shrink-0 text-fleet-moss" />
                  <span className="flex-1 truncate">{l.description}</span>
                  <span className="text-fleet-ink">{lineTypeLabels[l.lineType]}</span>
                  <span className="text-fleet-ink" dir="ltr">{formatDateDisplay(l.date)}</span>
                  <span className="font-bold text-fleet-navy">€{l.amount.toLocaleString("he-IL")}</span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {bankFeeItems.length > 0 && (
        <details className="rounded-xl border border-fleet-border bg-white p-3">
          <summary className="cursor-pointer text-xs font-bold text-fleet-ink">{t("recon_bank_fee_title", { count: bankFeeItems.length })}</summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {bankFeeItems.map((item) => {
              const l = item.bankLines[0];
              return (
                <div key={item.key} className="flex items-center gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs">
                  <span className="flex-1 truncate">{l.description}</span>
                  <span className="text-fleet-ink" dir="ltr">{formatDateDisplay(l.date)}</span>
                  <span className="font-bold text-fleet-navy">€{l.amount.toLocaleString("he-IL")}</span>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={busyLineId === item.key}
                      onClick={() =>
                        runQuickAction(item.key, async () => {
                          const fd = new FormData();
                          fd.set("category", "bank_fees");
                          fd.set("payment_method", "bank_transfer");
                          await createExpenseFromStatementLine(boatId, l.id, fd);
                        })
                      }
                      className="shrink-0 rounded-full bg-fleet-navy px-2.5 py-1 text-[11px] font-semibold text-fleet-paper hover:opacity-90 disabled:opacity-60"
                    >
                      {t("recon_accept_and_add")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {visibleItems.length === 0 && (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">{t("bank_stmt_none")}</p>
      )}
    </div>
  );
}
