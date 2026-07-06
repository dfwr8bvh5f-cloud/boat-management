"use client";

import { useRef, useState } from "react";
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
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { useFileDrop } from "@/lib/use-file-drop";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type {
  BankStatementLine,
  BankStmtLineType,
  CashTransaction,
  Expense,
  ExpenseCategory,
  Income,
  PaymentMethod,
} from "@/lib/types/database";

type MatchedRecord = Expense | CashTransaction | Income;
type LineWithMatch = BankStatementLine & { matchedRecord: MatchedRecord | null };
type ScanMatch = { record_id: string; record_type: BankStmtLineType; amount: number; date: string; mismatch: "date" | "amount" };
type ScanUnmatchedExisting = { record_id: string; record_type: BankStmtLineType; description: string; amount: number; date: string };
type ParsedLine = {
  date: string;
  description: string;
  amount: number;
  line_type: BankStmtLineType;
  status?: "near" | "none";
  match?: ScanMatch;
  category?: ExpenseCategory;
  payment_method?: PaymentMethod;
};

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export function BankReconciliationManager({
  boatId,
  unmatchedLines,
  matchedLines,
  unmatchedExpenses,
  unmatchedCashWithdrawals,
  unmatchedIncomes,
  categories,
  categoryLabels,
  paymentLabels,
  canEdit,
  locale,
}: {
  boatId: string;
  unmatchedLines: LineWithMatch[];
  matchedLines: LineWithMatch[];
  unmatchedExpenses: Expense[];
  unmatchedCashWithdrawals: CashTransaction[];
  unmatchedIncomes: Income[];
  categories: ExpenseCategory[];
  categoryLabels: Record<ExpenseCategory, string>;
  paymentLabels: Record<PaymentMethod, string>;
  canEdit: boolean;
  locale: Locale;
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
  const [dismissedLineIds, setDismissedLineIds] = useState<Set<string>>(new Set());
  const [exactMatchCount, setExactMatchCount] = useState(0);
  const [scanUnmatchedExisting, setScanUnmatchedExisting] = useState<ScanUnmatchedExisting[]>([]);
  const [editingGapId, setEditingGapId] = useState<string | null>(null);

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

  // Same-amount / same-date lookup across the unmatched records, keyed by
  // which ledger a line's type maps to - used to flag "this looks like
  // it's already entered, just under a different date/amount" instead of
  // only offering to create a brand new (duplicate) record.
  const normUnmatchedExpenses = unmatchedExpenses.map((e) => ({ id: e.id, date: e.expense_date ?? "", amount: e.amount }));
  const normUnmatchedCashWithdrawals = unmatchedCashWithdrawals.map((c) => ({ id: c.id, date: c.tx_date, amount: c.amount }));
  const normUnmatchedIncomes = unmatchedIncomes.map((i) => ({ id: i.id, date: i.income_date, amount: i.amount }));
  const poolFor = (lineType: BankStmtLineType) =>
    lineType === "expense" ? normUnmatchedExpenses : lineType === "cash_withdrawal" ? normUnmatchedCashWithdrawals : normUnmatchedIncomes;

  const daysBetween = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
  const closestByDate = <T extends { date: string }>(candidates: T[], target: string): T | null =>
    candidates.length === 0
      ? null
      : candidates.reduce((best, r) => (daysBetween(r.date, target) < daysBetween(best.date, target) ? r : best));

  // Same amount, but the date is off - only worth suggesting within a
  // month either way, so a coincidentally identical amount from months
  // apart (e.g. two unrelated recurring fees) isn't offered as a match.
  const findDateMismatchCandidate = (lineType: BankStmtLineType, date: string, amount: number) =>
    closestByDate(
      poolFor(lineType).filter((r) => r.amount === amount && daysBetween(r.date, date) <= 30),
      date
    );

  // Small, close-but-not-equal amount on (roughly) the same day - most
  // often a transcription typo in a previously entered record, like a
  // digit transposition, rather than a genuinely different transaction.
  const findAmountMismatchCandidate = (lineType: BankStmtLineType, date: string, amount: number) =>
    closestByDate(
      poolFor(lineType).filter(
        (r) => r.amount !== amount && daysBetween(r.date, date) <= 3 && Math.abs(r.amount - amount) <= Math.max(1, amount * 0.05)
      ),
      date
    );

  const renderUnmatchedRecords = (title: string, records: { id: string; description: string; date: string; amount: number }[]) =>
    records.length > 0 && (
      <div className="flex flex-col gap-2">
        <div className="text-xs font-bold text-fleet-ink">{title}</div>
        {records.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
            <div className="flex-1">
              <div className="text-sm">{r.description}</div>
              <div className="text-xs text-fleet-ink">{r.date}</div>
            </div>
            <div className="font-bold text-fleet-navy">€{r.amount.toLocaleString("he-IL")}</div>
          </div>
        ))}
      </div>
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
            accept="image/*,application/pdf"
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

                  return l.status === "near" && l.match ? (
                    <div key={i} className="flex flex-col gap-1.5 rounded-lg bg-fleet-brass/10 p-2.5 text-xs">
                      <p className="text-fleet-brass">
                        {t(l.match.mismatch === "date" ? "bank_stmt_date_mismatch_hint" : "bank_stmt_amount_mismatch_hint", {
                          date: l.match.date,
                          amount: l.match.amount.toLocaleString("he-IL"),
                        })}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">{editableFields}</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busyLineId === `preview-${i}`}
                          onClick={() => acceptScanCorrection(i)}
                          className="rounded-full bg-fleet-brass px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {t("bank_stmt_adopt_existing_word")}
                        </button>
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
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs">
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
              {parsedLines.some((l) => l.status !== "near") && (
                <form
                  action={async () => {
                    const importable = parsedLines.filter((l) => l.status !== "near");
                    setImporting(true);
                    await importBankStatementLines(boatId, importable);
                    setImporting(false);
                    setParsedLines((ls) => (ls ? ls.filter((l) => l.status === "near") : ls));
                  }}
                >
                  <button
                    type="submit"
                    disabled={importing}
                    className="w-full rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {importing
                      ? t("uploading_word")
                      : t("bank_stmt_import_cta", { count: parsedLines.filter((l) => l.status !== "near").length })}
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
                  <div className="flex-1">
                    <div>{r.description || lineTypeLabels[r.record_type]}</div>
                    <div className="text-fleet-ink">{r.date}</div>
                  </div>
                  <div className="font-bold text-fleet-navy">€{r.amount.toLocaleString("he-IL")}</div>
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

      {(unmatchedLines.length > 0 ||
        unmatchedExpenses.length > 0 ||
        unmatchedCashWithdrawals.length > 0 ||
        unmatchedIncomes.length > 0) && (
        <div className="rounded-xl border border-dashed border-fleet-coral bg-red-50 p-4">
          <div className="mb-1 text-sm font-bold text-fleet-coral">{t("bank_stmt_mismatch_title")}</div>
          <p className="text-xs text-fleet-ink">
            {t("bank_stmt_mismatch_hint", {
              lines: unmatchedLines.length,
              records: unmatchedExpenses.length + unmatchedCashWithdrawals.length + unmatchedIncomes.length,
            })}
          </p>
          {canEdit && unmatchedLines.length > 0 && (
            <button
              type="button"
              disabled={rematching}
              onClick={async () => {
                setRematching(true);
                await rematchBankStatementLines(boatId);
                setRematching(false);
              }}
              className="mt-2 rounded-full bg-fleet-navy px-3 py-1.5 text-xs font-semibold text-fleet-paper hover:opacity-90 disabled:opacity-60"
            >
              {rematching ? t("uploading_word") : t("bank_stmt_rematch_cta")}
            </button>
          )}
        </div>
      )}

      {unmatchedLines.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold text-fleet-ink">{t("bank_stmt_unmatched_lines_title")}</div>
          {unmatchedLines.map((l) => (
            <div key={l.id} className="rounded-xl border border-fleet-border bg-white p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-sm">{l.description}</div>
                  <div className="text-xs text-fleet-ink">{l.tx_date}</div>
                </div>
                <div className="font-bold text-fleet-navy">€{l.amount.toLocaleString("he-IL")}</div>
                {canEdit && (
                  <>
                    <select
                      value={l.line_type}
                      disabled={busyLineId === l.id}
                      onChange={(e) =>
                        runQuickAction(l.id, () =>
                          updateBankStatementLineType(boatId, l.id, e.target.value as BankStmtLineType)
                        )
                      }
                      className="rounded-md border border-fleet-border bg-white px-1.5 py-1 text-[11px] disabled:opacity-60"
                    >
                      {(Object.keys(lineTypeLabels) as BankStmtLineType[]).map((k) => (
                        <option key={k} value={k}>
                          {lineTypeLabels[k]}
                        </option>
                      ))}
                    </select>
                    {l.line_type === "expense" ? (
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
                            l.line_type === "cash_withdrawal"
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
                      <ConfirmSubmitButton
                        confirmMessage={t("bank_stmt_delete_line_confirm")}
                        className="text-fleet-ink hover:text-fleet-coral"
                      >
                        <Trash2 size={15} />
                      </ConfirmSubmitButton>
                    </form>
                  </>
                )}
              </div>
              {!dismissedLineIds.has(l.id) &&
                (() => {
                  const amountCandidate = findAmountMismatchCandidate(l.line_type, l.tx_date, l.amount);
                  const dateCandidate = !amountCandidate ? findDateMismatchCandidate(l.line_type, l.tx_date, l.amount) : null;
                  const candidate = amountCandidate ?? dateCandidate;
                  if (!candidate) return null;

                  const hintKey = amountCandidate ? "bank_stmt_amount_mismatch_hint" : "bank_stmt_date_mismatch_hint";
                  const hintVars = { date: candidate.date, amount: candidate.amount.toLocaleString("he-IL") };
                  const adopt = () =>
                    runQuickAction(l.id, () =>
                      adoptStatementLineIntoRecord(
                        boatId,
                        l.id,
                        l.line_type,
                        candidate.id,
                        amountCandidate ? { amount: l.amount } : { tx_date: l.tx_date }
                      )
                    );

                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-fleet-brass/10 px-2.5 py-1.5 text-xs text-fleet-brass">
                      <span className="flex-1">{t(hintKey, hintVars)}</span>
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            disabled={busyLineId === l.id}
                            onClick={adopt}
                            className="rounded-full bg-fleet-brass px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                          >
                            {t("bank_stmt_adopt_existing_word")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDismissedLineIds((s) => new Set(s).add(l.id))}
                            className="rounded-full border border-fleet-brass px-2.5 py-1 text-[11px] font-semibold text-fleet-brass hover:bg-fleet-brass/10"
                          >
                            {t("reject_change_word")}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}
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
          ))}
        </div>
      )}

      {renderUnmatchedRecords(
        t("bank_stmt_unmatched_expenses_title"),
        unmatchedExpenses.map((e) => ({ id: e.id, description: e.description, date: e.expense_date ?? "", amount: e.amount }))
      )}
      {renderUnmatchedRecords(
        t("bank_stmt_unmatched_cash_title"),
        unmatchedCashWithdrawals.map((c) => ({ id: c.id, description: c.notes ?? "", date: c.tx_date, amount: c.amount }))
      )}
      {renderUnmatchedRecords(
        t("bank_stmt_unmatched_income_title"),
        unmatchedIncomes.map((i) => ({ id: i.id, description: i.source, date: i.income_date, amount: i.amount }))
      )}

      {matchedLines.length > 0 && (
        <details className="rounded-xl border border-fleet-border bg-white p-3">
          <summary className="cursor-pointer text-xs font-bold text-fleet-moss">
            {t("bank_stmt_matched_title", { count: matchedLines.length })}
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {matchedLines.map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs">
                <CheckCircle2 size={13} className="shrink-0 text-fleet-moss" />
                <span className="flex-1 truncate">{l.description}</span>
                <span className="text-fleet-ink">{lineTypeLabels[l.line_type]}</span>
                <span className="text-fleet-ink">{l.tx_date}</span>
                <span className="font-bold text-fleet-navy">€{l.amount.toLocaleString("he-IL")}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {unmatchedLines.length === 0 && matchedLines.length === 0 && (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("bank_stmt_none")}
        </p>
      )}
    </div>
  );
}
