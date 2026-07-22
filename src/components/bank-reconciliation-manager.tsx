"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, ArrowLeftRight, CheckCircle2, Download, FileText, Pencil, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
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
  archiveReconciliationRecord,
  unarchiveReconciliationRecord,
  deleteBankStatementFile,
  renameBankStatementFile,
} from "@/lib/actions/bank-statement";
import { createExpense } from "@/lib/actions/expenses";
import { createCashTransaction } from "@/lib/actions/cash";
import { createIncome } from "@/lib/actions/incomes";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { formatDateDisplay } from "@/lib/date-format";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { useFileDrop } from "@/lib/use-file-drop";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { ReconciliationStatus } from "@/lib/reconciliation-engine";
import type { BankStmtLineType, ExpenseCategory, PaymentMethod } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";
import { round2, formatCurrency } from "@/lib/money";

export type ReconItemBankLine = { id: string; lineType: BankStmtLineType; description: string; date: string; amount: number };
export type ReconItemAppRecord = {
  id: string;
  recordType: BankStmtLineType;
  description: string;
  date: string;
  amount: number;
  fromArchive?: boolean;
};
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
  isBankFee?: boolean;
  category?: ExpenseCategory;
  payment_method?: PaymentMethod;
};

// Reads the sessionStorage-cached scan preview (see the comment above its
// writer effect below) synchronously as each piece of state's own initial
// value, instead of an effect that sets state right after mount - avoids an
// extra render pass on every mount of this component.
function readScanCache(key: string): {
  parsedLines: ParsedLine[] | null;
  exactMatchCount: number;
  scanUnmatchedExisting: ScanUnmatchedExisting[];
} {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return { parsedLines: null, exactMatchCount: 0, scanUnmatchedExisting: [] };
    const cached = JSON.parse(raw) as {
      parsedLines?: ParsedLine[];
      exactMatchCount?: number;
      scanUnmatchedExisting?: ScanUnmatchedExisting[];
    };
    return {
      parsedLines: cached.parsedLines ?? null,
      exactMatchCount: typeof cached.exactMatchCount === "number" ? cached.exactMatchCount : 0,
      scanUnmatchedExisting: cached.scanUnmatchedExisting ?? [],
    };
  } catch {
    return { parsedLines: null, exactMatchCount: 0, scanUnmatchedExisting: [] };
  }
}

export type ExpenseReconciliationFlag = {
  type: "date_mismatch" | "amount_mismatch" | "missing" | "matched";
  suggestedDate?: string;
};

export type StatementFile = { id: string; fileName: string; uploadedAt: string; url: string | null };

const inputClass = INPUT_CLASS;

export function BankReconciliationManager({
  boatId,
  reconciliationItems,
  archivedItems = [],
  statementFiles = [],
  categories,
  categoryLabels,
  paymentLabels,
  canEdit,
  locale,
  onExpenseFlagsChange,
}: {
  boatId: string;
  reconciliationItems: ReconciliationItem[];
  archivedItems?: ReconciliationItem[];
  statementFiles?: StatementFile[];
  categories: ExpenseCategory[];
  categoryLabels: Record<ExpenseCategory, string>;
  paymentLabels: Record<PaymentMethod, string>;
  canEdit: boolean;
  locale: Locale;
  onExpenseFlagsChange?: (flags: Record<string, ExpenseReconciliationFlag>) => void;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const fileRef = useRef<HTMLInputElement>(null);

  // Every accept/reject action below calls a server action, and Next.js
  // refreshes the current route's server-rendered data right after - which
  // can remount this client component and wipe its in-memory scan results,
  // forcing her to re-upload and re-scan the whole statement just to
  // process the next line. Mirroring the scan results into sessionStorage
  // (scoped to this boat, cleared once the whole preview is resolved) lets
  // them survive a remount without leaking into a brand new browser tab.
  const scanCacheKey = `bank_scan_preview_${boatId}`;
  const [parsedLines, setParsedLines] = useState<ParsedLine[] | null>(() => readScanCache(scanCacheKey).parsedLines);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [expenseFormLineId, setExpenseFormLineId] = useState<string | null>(null);
  const [newExpenseCategory, setNewExpenseCategory] = useState<ExpenseCategory>("other");
  const [newExpensePayment, setNewExpensePayment] = useState<"card" | "bank_transfer">("card");
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);
  const [exactMatchCount, setExactMatchCount] = useState(() => readScanCache(scanCacheKey).exactMatchCount);
  const [scanUnmatchedExisting, setScanUnmatchedExisting] = useState<ScanUnmatchedExisting[]>(
    () => readScanCache(scanCacheKey).scanUnmatchedExisting
  );
  const [editingGapId, setEditingGapId] = useState<string | null>(null);
  const [selectedScanIndices, setSelectedScanIndices] = useState<Set<number>>(new Set());
  const [bulkScanApplying, setBulkScanApplying] = useState(false);
  const [statementName, setStatementName] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const archivedRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    try {
      if (parsedLines === null) {
        sessionStorage.removeItem(scanCacheKey);
      } else {
        sessionStorage.setItem(scanCacheKey, JSON.stringify({ parsedLines, exactMatchCount, scanUnmatchedExisting }));
      }
    } catch {
      // storage unavailable/full - the preview still works, just won't survive a remount
    }
  }, [parsedLines, exactMatchCount, scanUnmatchedExisting, scanCacheKey]);

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
      } else if (item.status === "matched") {
        flags[app.id] = { type: "matched" };
      }
    }
    onExpenseFlagsChange(flags);
  }, [parsedLines, scanUnmatchedExisting, reconciliationItems, onExpenseFlagsChange]);

  const lineTypeLabels: Record<BankStmtLineType, string> = {
    expense: t("bank_stmt_type_expense"),
    cash_withdrawal: t("bank_stmt_type_cash_withdrawal"),
    income: t("bank_stmt_type_income"),
  };

  // Shared by a fresh upload and a re-scan of an already-saved statement -
  // skipSave is set for the latter, since the file is already sitting in
  // storage with its own bank_statement_files row and must not be saved a
  // second time under a new path.
  const runScan = async (file: File, skipSave: boolean) => {
    setScanError(null);
    setParsedLines(null);
    setExactMatchCount(0);
    setScanUnmatchedExisting([]);
    setSelectedScanIndices(new Set());
    if (file.size > MAX_SCAN_FILE_BYTES) {
      setScanError(t("scan_file_too_large"));
      return;
    }
    setScanning(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("boat_id", boatId);
      if (skipSave) body.set("skip_save", "1");
      else if (statementName.trim()) body.set("statement_name", statementName.trim());
      const res = await fetch("/api/scan-bank-statement", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanError(data.error ?? t("scan_fail"));
        return;
      }
      // Lines identified as a bank fee get a fixed, human description
      // instead of whatever the statement printed (often a cryptic bank
      // reference code) - she wants every bank-fee expense entered the
      // same recognizable way.
      const lines: ParsedLine[] = (data.result?.lines ?? []).map((l: ParsedLine) =>
        l.isBankFee ? { ...l, description: t("recon_status_bank_fee") } : l
      );
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
      setStatementName("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    return runScan(file, false);
  };

  const [rescanningFileId, setRescanningFileId] = useState<string | null>(null);
  const rescanSavedFile = async (f: StatementFile) => {
    if (!f.url || scanning) return;
    setRescanningFileId(f.id);
    try {
      const fileRes = await fetch(f.url);
      const blob = await fileRes.blob();
      const file = new File([blob], f.fileName, { type: blob.type });
      await runScan(file, true);
    } catch {
      setScanError(t("scan_connect_fail"));
    } finally {
      setRescanningFileId(null);
    }
  };

  const acceptScanCorrection = (i: number) =>
    runQuickAction(`preview-${i}`, async () => {
      const l = parsedLines?.[i];
      if (!l?.match) return;
      await adoptStatementLineIntoRecord(boatId, null, l.match.record_type, l.match.record_id, { tx_date: l.date, amount: l.amount });
      removeParsedLine(i);
    });

  const toggleScanSelected = (i: number) =>
    setSelectedScanIndices((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Applies whatever action each selected row supports - "adopt existing"
  // for a date/amount/cross-type mismatch, or "create new" for a bank fee
  // (or any other plain new line) - so both kinds can be swept in one go
  // instead of clicking every row individually.
  const applyBulkScanCorrections = async () => {
    setBulkScanApplying(true);
    const indices = [...selectedScanIndices].sort((a, b) => b - a); // remove highest-index first so earlier indices stay valid
    for (const i of indices) {
      const l = parsedLines?.[i];
      if (!l) continue;
      if (l.status === "review" && l.match && l.match.mismatch !== "split") {
        await adoptStatementLineIntoRecord(boatId, null, l.match.record_type, l.match.record_id, { tx_date: l.date, amount: l.amount });
      } else if (l.status === "new") {
        await createRecordFromLine(l);
      } else {
        continue;
      }
      removeParsedLine(i);
    }
    setSelectedScanIndices(new Set());
    setBulkScanApplying(false);
  };

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
  const createRecordFromLine = async (l: ParsedLine) => {
    if (l.line_type === "expense") {
      const fd = new FormData();
      fd.set("description", l.description);
      fd.set("amount", String(l.amount));
      fd.set("category", l.category ?? (l.isBankFee ? "bank_fees" : "other"));
      fd.set("payment_method", l.payment_method ?? (l.isBankFee ? "bank_transfer" : "card"));
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
  };

  const acceptNewLine = (i: number) =>
    runQuickAction(`new-${i}`, async () => {
      const l = parsedLines?.[i];
      if (!l) return;
      await createRecordFromLine(l);
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
  const [actionError, setActionError] = useState<string | null>(null);
  // Shared by every onClick-driven delete in this component (as opposed to
  // a <form>-submitted one, which already uses ConfirmSubmitButton) - these
  // used window.confirm() before, which is a jarring, LTR OS-chrome dialog
  // in an otherwise RTL Hebrew app and inconsistent with the in-app modal
  // used everywhere else for a destructive confirmation.
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; run: () => void } | null>(null);
  const visibleItems = useMemo(
    () => reconciliationItems.filter((item) => !dismissedItemKeys.has(item.key)),
    [reconciliationItems, dismissedItemKeys]
  );

  // Deleting used to be a bare <form action={...}> - if the delete ever
  // failed server-side (RLS, a constraint, anything) it failed completely
  // silently: the row just stayed put with no indication why, which looked
  // indistinguishable from the button being broken. Routing it through a
  // click handler lets the real error reach her instead of vanishing.
  const deleteRecord = (recordType: BankStmtLineType, recordId: string, confirmMessage: string) => {
    setPendingConfirm({
      message: confirmMessage,
      run: async () => {
        setActionError(null);
        try {
          await deleteReconciliationRecord(boatId, recordType, recordId);
        } catch (e) {
          setActionError(e instanceof Error ? e.message : String(e));
        }
      },
    });
  };

  const archiveRecord = async (recordType: BankStmtLineType, recordId: string) => {
    setActionError(null);
    try {
      await archiveReconciliationRecord(boatId, recordType, recordId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const unarchiveRecord = async (recordType: BankStmtLineType, recordId: string) => {
    setActionError(null);
    try {
      await unarchiveReconciliationRecord(boatId, recordType, recordId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const [deletingStatementFileId, setDeletingStatementFileId] = useState<string | null>(null);
  const deleteStatementFile = (fileId: string) => {
    setPendingConfirm({
      message: t("recon_delete_statement_confirm"),
      run: async () => {
        setDeletingStatementFileId(fileId);
        setActionError(null);
        try {
          await deleteBankStatementFile(boatId, fileId);
        } catch (e) {
          setActionError(e instanceof Error ? e.message : String(e));
        } finally {
          setDeletingStatementFileId(null);
        }
      },
    });
  };

  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const renameStatementFile = async (fileId: string, fileName: string) => {
    setRenamingFileId(fileId);
    setActionError(null);
    try {
      await renameBankStatementFile(boatId, fileId, fileName);
      setEditingFileId(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setRenamingFileId(null);
    }
  };

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

  const { reviewItems, missingInAppItems, missingInBankItems, duplicateItems, splitItems, matchedItems, bankFeeItems } =
    useMemo(() => {
      const byStatus = <S extends ReconciliationStatus>(status: S) => visibleItems.filter((item) => item.status === status);
      return {
        reviewItems: [...byStatus("needs_review"), ...byStatus("likely_match")],
        missingInAppItems: byStatus("missing_in_app"),
        missingInBankItems: byStatus("missing_in_bank"),
        duplicateItems: byStatus("possible_duplicate"),
        splitItems: byStatus("possible_split_match"),
        matchedItems: byStatus("matched"),
        bankFeeItems: byStatus("bank_fee"),
      };
    }, [visibleItems]);

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
      className={`shrink-0 rounded-full px-2 py-0.5 text-3xs font-bold ${
        status === "needs_review" || status === "possible_duplicate"
          ? "bg-fleet-coral/10 text-fleet-coral-text"
          : "bg-fleet-brass/10 text-fleet-brass"
      }`}
    >
      {statusLabels[status]} · {confidence}%
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      {archivedItems.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setArchivedOpen(true);
            archivedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="flex w-fit items-center gap-1.5 self-end rounded-full border border-fleet-border bg-white px-3 py-1.5 text-xs font-semibold text-fleet-ink hover:border-fleet-brass hover:text-fleet-navy"
        >
          <Archive size={14} /> {t("recon_archived_title", { count: archivedItems.length })}
        </button>
      )}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-fleet-coral bg-fleet-coral/10 px-3 py-2 text-xs text-fleet-coral-text">
          <span className="flex-1">
            {t("recon_delete_failed")}: {actionError}
          </span>
          <button type="button" onClick={() => setActionError(null)} aria-label="dismiss" className="shrink-0 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}
      {pendingConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setPendingConfirm(null)}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-fleet-navy">{pendingConfirm.message}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPendingConfirm(null)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                {t("no_word")}
              </button>
              <button
                type="button"
                onClick={() => {
                  pendingConfirm.run();
                  setPendingConfirm(null);
                }}
                className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
              >
                {t("yes_word")}
              </button>
            </div>
          </div>
        </div>
      )}
      {canEdit && (
        <div className="rounded-xl border border-dashed border-fleet-brass bg-white p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
            <Upload size={16} className="text-fleet-brass" /> {t("bank_stmt_upload_title")}
          </div>
          <input
            type="text"
            value={statementName}
            onChange={(e) => setStatementName(e.target.value)}
            placeholder={t("bank_stmt_name_placeholder")}
            disabled={scanning}
            className={`${inputClass} mb-2 w-full disabled:opacity-60`}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            {...dropHandlers}
            className={`relative flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-fleet-navy disabled:opacity-60 ${
              dragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-brass bg-fleet-paper"
            }`}
          >
            {scanning ? <Sparkles size={16} className="animate-twinkle" /> : <Upload size={16} />} {scanning ? t("scanning") : t("bank_stmt_upload_cta")}
            {dragging && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                <Plus size={16} className="text-fleet-teal" />
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
          {scanError && <p className="mt-2 text-xs text-fleet-coral-text">{scanError}</p>}

          {statementFiles.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-bold text-fleet-navy">
                {t("recon_saved_statements_title", { count: statementFiles.length })}
              </summary>
              <div className="mt-2 flex flex-col gap-1.5">
                {statementFiles.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs">
                    <FileText size={14} className="shrink-0 text-fleet-ink" />
                    {editingFileId === f.id ? (
                      <form
                        action={(formData) => renameStatementFile(f.id, String(formData.get("file_name") ?? ""))}
                        className="flex min-w-0 flex-1 items-center gap-1.5"
                      >
                        <input
                          name="file_name"
                          defaultValue={f.fileName}
                          autoFocus
                          className="min-w-0 flex-1 rounded border border-fleet-border bg-white px-1.5 py-1 text-xs outline-none focus:border-fleet-teal"
                        />
                        <button
                          type="submit"
                          disabled={renamingFileId === f.id}
                          aria-label={t("save_word")}
                          className="flex h-7 w-7 shrink-0 items-center justify-center text-fleet-teal disabled:opacity-60"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFileId(null)}
                          aria-label={t("close_word")}
                          className="flex h-7 w-7 shrink-0 items-center justify-center text-fleet-ink"
                        >
                          <X size={14} />
                        </button>
                      </form>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{f.fileName}</div>
                        <div className="text-fleet-ink" dir="ltr">{formatDateDisplay(f.uploadedAt.slice(0, 10))}</div>
                      </div>
                    )}
                    {canEdit && editingFileId !== f.id && (
                      <button
                        type="button"
                        onClick={() => setEditingFileId(f.id)}
                        aria-label={t("update_word")}
                        title={t("update_word")}
                        className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {f.url && canEdit && editingFileId !== f.id && (
                      <button
                        type="button"
                        disabled={scanning || rescanningFileId === f.id}
                        aria-label="rescan"
                        title={t("recon_rescan_statement")}
                        className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal disabled:opacity-60"
                        onClick={() => rescanSavedFile(f)}
                      >
                        <Sparkles size={14} className={rescanningFileId === f.id ? "animate-twinkle" : undefined} />
                      </button>
                    )}
                    {f.url && editingFileId !== f.id && (
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="download"
                        title={t("recon_download_statement")}
                        className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                      >
                        <Download size={14} />
                      </a>
                    )}
                    {canEdit && editingFileId !== f.id && (
                      <button
                        type="button"
                        disabled={deletingStatementFileId === f.id}
                        aria-label="delete"
                        className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text disabled:opacity-60"
                        onClick={() => deleteStatementFile(f.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {parsedLines && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-fleet-ink">
                  {t("bank_stmt_preview_title", { count: parsedLines.length })}
                  {exactMatchCount > 0 && ` · ${t("bank_stmt_already_recorded_count", { count: exactMatchCount })}`}
                </div>
                {parsedLines.some((l) => l.status === "review" && l.match && l.match.mismatch !== "split") && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedScanIndices(
                        new Set(
                          parsedLines
                            .map((l, i) => ({ l, i }))
                            .filter(({ l }) => l.status === "review" && l.match?.mismatch === "date")
                            .map(({ i }) => i)
                        )
                      )
                    }
                    className="text-2xs font-semibold text-fleet-teal underline hover:opacity-80"
                  >
                    {t("recon_select_date_mismatches")}
                  </button>
                )}
                {parsedLines.some((l) => l.isBankFee) && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedScanIndices(
                        new Set(parsedLines.map((l, i) => ({ l, i })).filter(({ l }) => l.isBankFee).map(({ i }) => i))
                      )
                    }
                    className="text-2xs font-semibold text-fleet-teal underline hover:opacity-80"
                  >
                    {t("recon_select_bank_fees")}
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {parsedLines.map((l, i) => {
                  const editableFields = (
                    <>
                      <input
                        type="date"
                        value={l.date}
                        onChange={(e) => setParsedLineDate(i, e.target.value)}
                        className="w-32 shrink-0 rounded-md border border-fleet-border bg-white px-1 py-1 text-2xs text-fleet-ink"
                      />
                      <input
                        value={l.description}
                        onChange={(e) => setParsedLineDescription(i, e.target.value)}
                        className="min-w-24 flex-1 rounded-md border border-fleet-border bg-white px-1.5 py-1 text-2xs"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={l.amount}
                        onChange={(e) => setParsedLineAmount(i, Number(e.target.value))}
                        className="w-20 rounded-md border border-fleet-border bg-white px-1.5 py-1 text-2xs font-bold text-fleet-navy"
                      />
                      <CustomSelect
                        value={l.line_type}
                        onChange={(v) => setParsedLineType(i, v as BankStmtLineType)}
                        options={(Object.keys(lineTypeLabels) as BankStmtLineType[]).map((k) => ({ value: k, label: lineTypeLabels[k] }))}
                        className="rounded-md border border-fleet-border bg-white px-1.5 py-1 text-2xs"
                      />
                      {l.line_type === "expense" && (
                        <>
                          <CustomSelect
                            value={l.category ?? (l.isBankFee ? "bank_fees" : "other")}
                            onChange={(v) => setParsedLineCategory(i, v as ExpenseCategory)}
                            options={categories.map((k) => ({ value: k, label: categoryLabels[k] }))}
                            className="rounded-md border border-fleet-border bg-white px-1.5 py-1 text-2xs"
                          />
                          <CustomSelect
                            value={l.payment_method ?? (l.isBankFee ? "bank_transfer" : "card")}
                            onChange={(v) => setParsedLinePaymentMethod(i, v as PaymentMethod)}
                            options={(["card", "bank_transfer"] as const).map((k) => ({ value: k, label: paymentLabels[k] }))}
                            className="rounded-md border border-fleet-border bg-white px-1.5 py-1 text-2xs"
                          />
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
                  const badgeKeyByMismatch: Record<ScanMatch["mismatch"], Parameters<typeof t>[0]> = {
                    date: "reconciliation_flag_date_mismatch",
                    amount: "reconciliation_flag_amount_mismatch",
                    cross_type: "recon_badge_cross_type",
                    split: "recon_status_possible_split_match",
                  };

                  const hintText = t(hintKeyByMismatch[l.match?.mismatch ?? "date"], {
                    date: l.match ? formatDateDisplay(l.match.date) : "",
                    amount: l.match ? l.match.amount.toLocaleString("he-IL") : "",
                    count: l.matchCount ?? 1,
                  });

                  // A date mismatch is routine (card processing lag) - anything
                  // else (amount/type mismatch, possible split) is a genuine
                  // discrepancy worth a closer look, so it gets a stronger
                  // visual (light red/coral) instead of the routine amber.
                  const isRoutineMismatch = l.match?.mismatch === "date";
                  const mismatchBg = isRoutineMismatch ? "bg-fleet-brass/10" : "bg-fleet-coral/10";
                  const mismatchBadgeClass = isRoutineMismatch
                    ? "bg-fleet-brass/15 text-fleet-brass"
                    : "bg-fleet-coral/15 text-fleet-coral-text";
                  const mismatchTextClass = isRoutineMismatch ? "text-fleet-brass" : "text-fleet-coral-text";

                  return l.status === "review" && l.match ? (
                    <div key={i} className={`flex flex-col gap-1.5 rounded-lg ${mismatchBg} p-2.5 text-xs`}>
                      <p className={`truncate ${mismatchTextClass}`} title={hintText}>
                        {hintText}
                      </p>
                      <div className="flex items-center gap-2 overflow-x-auto overscroll-x-contain">
                        {l.match.mismatch !== "split" && (
                          <input
                            type="checkbox"
                            checked={selectedScanIndices.has(i)}
                            onChange={() => toggleScanSelected(i)}
                            aria-label={t("select_row_word")}
                            className="h-3.5 w-3.5 shrink-0 rounded border-fleet-border"
                          />
                        )}
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-3xs font-bold ${mismatchBadgeClass}`}>
                          {t(badgeKeyByMismatch[l.match.mismatch])}
                        </span>
                        {editableFields}
                        {l.match.mismatch !== "split" && (
                          <button
                            type="button"
                            disabled={busyLineId === `preview-${i}`}
                            onClick={() => acceptScanCorrection(i)}
                            title={t(l.match.mismatch === "date" ? "recon_accept_date_change" : "bank_stmt_adopt_existing_word")}
                            aria-label={t(l.match.mismatch === "date" ? "recon_accept_date_change" : "bank_stmt_adopt_existing_word")}
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:opacity-90 disabled:opacity-60 ${
                              isRoutineMismatch ? "bg-fleet-brass" : "bg-fleet-coral"
                            }`}
                          >
                            <ArrowLeftRight size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyLineId === `new-${i}`}
                          onClick={() => acceptNewLine(i)}
                          title={t("accept_change_word")}
                          aria-label={t("accept_change_word")}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fleet-navy text-fleet-paper hover:opacity-90 disabled:opacity-60"
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeParsedLine(i)}
                          aria-label="remove"
                          className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={i}
                      className={`flex items-center gap-2 overflow-x-auto overscroll-x-contain rounded-lg px-2.5 py-1.5 text-xs ${
                        l.isBankFee ? "bg-fleet-paper" : "bg-fleet-coral/10"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedScanIndices.has(i)}
                        onChange={() => toggleScanSelected(i)}
                        aria-label={t("select_row_word")}
                        className="h-3.5 w-3.5 shrink-0 rounded border-fleet-border"
                      />
                      {l.isBankFee && (
                        <span className="shrink-0 rounded-full bg-fleet-brass/15 px-2 py-0.5 text-3xs font-bold text-fleet-brass">
                          {t("recon_status_bank_fee")}
                        </span>
                      )}
                      {editableFields}
                      <button
                        type="button"
                        disabled={busyLineId === `new-${i}`}
                        onClick={() => acceptNewLine(i)}
                        title={l.isBankFee ? t("recon_accept_and_add") : t("accept_change_word")}
                        aria-label={l.isBankFee ? t("recon_accept_and_add") : t("accept_change_word")}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fleet-navy text-fleet-paper hover:opacity-90 disabled:opacity-60"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeParsedLine(i)}
                        aria-label="remove"
                        className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {selectedScanIndices.size > 0 && (
                <button
                  type="button"
                  disabled={bulkScanApplying}
                  onClick={applyBulkScanCorrections}
                  className="w-fit rounded-full bg-fleet-navy px-3.5 py-2 text-xs font-bold text-fleet-paper hover:opacity-90 disabled:opacity-60"
                >
                  {bulkScanApplying ? t("uploading_word") : t("recon_apply_selected", { count: selectedScanIndices.size })}
                </button>
              )}
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
        <div className="rounded-xl border border-dashed border-fleet-coral bg-fleet-coral/10 p-4">
          <div className="mb-1 text-sm font-bold text-fleet-coral-text">{t("bank_stmt_scan_gap_title")}</div>
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
                  <div className="shrink-0 font-bold text-fleet-navy">{formatCurrency(r.amount)}</div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditingGapId(r.record_id)}
                      aria-label="edit"
                      className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label="archive"
                      title={t("recon_archive_record")}
                      className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-brass"
                      onClick={async () => {
                        await archiveRecord(r.record_type, r.record_id);
                        setScanUnmatchedExisting((rs) => rs.filter((x) => x.record_id !== r.record_id));
                      }}
                    >
                      <Archive size={14} />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label="delete"
                      className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                      onClick={() => {
                        setPendingConfirm({
                          message: t("bank_stmt_delete_gap_confirm", { type: lineTypeLabels[r.record_type] }),
                          run: async () => {
                            setActionError(null);
                            try {
                              await deleteReconciliationRecord(boatId, r.record_type, r.record_id);
                              setScanUnmatchedExisting((rs) => rs.filter((x) => x.record_id !== r.record_id));
                            } catch (e) {
                              setActionError(e instanceof Error ? e.message : String(e));
                            }
                          },
                        });
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setScanUnmatchedExisting((rs) => rs.filter((x) => x.record_id !== r.record_id))}
                    aria-label="dismiss"
                    title={t("bank_stmt_scan_gap_dismiss")}
                    className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-fleet-ink">{t("recon_review_title")}</div>
            {canEdit && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedReviewKeys(
                      new Set(
                        reviewItems
                          .filter((item) => mismatchFor(item.bankLines[0], item.appRecords[0]) === "date")
                          .map((item) => item.key)
                      )
                    )
                  }
                  className="text-2xs font-semibold text-fleet-teal underline hover:opacity-80"
                >
                  {t("recon_select_date_mismatches")}
                </button>
                <label className="flex items-center gap-1.5 text-2xs font-semibold text-fleet-ink">
                  <input
                    type="checkbox"
                    checked={selectedReviewKeys.size > 0 && selectedReviewKeys.size === reviewItems.length}
                    onChange={(e) => setSelectedReviewKeys(e.target.checked ? new Set(reviewItems.map((item) => item.key)) : new Set())}
                    className="h-3.5 w-3.5 rounded border-fleet-border"
                  />
                  {t("select_all_word")}
                </label>
              </div>
            )}
          </div>
          {reviewItems.map((item) => {
            const bank = item.bankLines[0];
            const app = item.appRecords[0];
            const mismatch = mismatchFor(bank, app);
            const hintKey = (
              app.fromArchive
                ? "bank_stmt_archive_match_hint"
                : {
                    date: "bank_stmt_date_mismatch_hint",
                    amount: "bank_stmt_amount_mismatch_hint",
                    cross_type: "bank_stmt_cross_type_hint",
                    split: "bank_stmt_split_hint",
                  }[mismatch]
            ) as Parameters<typeof t>[0];
            return (
              <div key={item.key} className="rounded-xl border border-fleet-border bg-white p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  {canEdit && (
                    <input
                      type="checkbox"
                      checked={selectedReviewKeys.has(item.key)}
                      onChange={() => toggleReviewSelected(item.key)}
                      aria-label={t("select_row_word")}
                      className="h-3.5 w-3.5 shrink-0 rounded border-fleet-border"
                    />
                  )}
                  <StatusBadge status={item.status} confidence={item.confidence} />
                  {app.fromArchive && (
                    <span className="flex items-center gap-1 rounded-full bg-fleet-navy/10 px-2 py-0.5 text-3xs font-bold text-fleet-navy">
                      <Archive size={14} />
                      {t("recon_from_archive_badge")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-fleet-ink">{bank.description}</div>
                    <div className="text-fleet-ink/70" dir="ltr">{formatDateDisplay(bank.date)}</div>
                  </div>
                  <div className="shrink-0 font-bold text-fleet-navy">{formatCurrency(bank.amount)}</div>
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-fleet-brass/10 px-2.5 py-1.5 text-xs text-fleet-brass">
                  {(() => {
                    const reviewHintText = t(hintKey, { date: formatDateDisplay(app.date), amount: app.amount.toLocaleString("he-IL") });
                    return (
                      <span className="flex-1 truncate" title={reviewHintText}>
                        {reviewHintText}
                      </span>
                    );
                  })()}
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        disabled={busyLineId === item.key}
                        onClick={() => runQuickAction(item.key, () => applyReviewItem(item))}
                        className="rounded-full bg-fleet-brass px-2.5 py-1 text-2xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                      >
                        {t(mismatch === "date" ? "recon_accept_date_change" : "bank_stmt_adopt_existing_word")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedItemKeys((s) => new Set(s).add(item.key))}
                        className="rounded-full border border-fleet-brass px-2.5 py-1 text-2xs font-semibold text-fleet-brass hover:bg-fleet-brass/10"
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
        <div className="rounded-xl border border-dashed border-fleet-coral bg-fleet-coral/10 p-4">
          <div className="mb-1 text-sm font-bold text-fleet-coral-text">{t("recon_duplicate_title")}</div>
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
                    <div className="shrink-0 font-bold text-fleet-navy">{formatCurrency(r.amount)}</div>
                    {canEdit && (
                      <button
                        type="button"
                        aria-label="delete"
                        className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                        onClick={() => deleteRecord(r.recordType, r.id, t("bank_stmt_delete_gap_confirm", { type: lineTypeLabels[r.recordType] }))}
                      >
                        <Trash2 size={14} />
                      </button>
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
                  <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-3xs font-bold text-fleet-ink">{lineTypeLabels[r.type]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{r.description}</div>
                    <div className="text-fleet-ink" dir="ltr">{formatDateDisplay(r.date)}</div>
                  </div>
                  <div className="shrink-0 font-bold text-fleet-navy">{formatCurrency(r.amount)}</div>
                </div>
              ))}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setDismissedItemKeys((s) => new Set(s).add(item.key))}
                  className="mt-1 w-fit rounded-full border border-fleet-border px-2.5 py-1 text-2xs font-semibold text-fleet-ink hover:bg-fleet-paper"
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
                <div className="flex items-center gap-3 overflow-x-auto overscroll-x-contain">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{l.description}</div>
                    <div className="text-xs text-fleet-ink" dir="ltr">{formatDateDisplay(l.date)}</div>
                  </div>
                  <div className="shrink-0 font-bold text-fleet-navy">{formatCurrency(l.amount)}</div>
                  {canEdit && (
                    <>
                      <CustomSelect
                        value={l.lineType}
                        disabled={busyLineId === l.id}
                        onChange={(v) => runQuickAction(l.id, () => updateBankStatementLineType(boatId, l.id, v as BankStmtLineType))}
                        options={(Object.keys(lineTypeLabels) as BankStmtLineType[]).map((k) => ({ value: k, label: lineTypeLabels[k] }))}
                        className="rounded-md border border-fleet-border bg-white px-1.5 py-1 text-2xs disabled:opacity-60"
                      />
                      {l.lineType === "expense" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setExpenseFormLineId((id) => (id === l.id ? null : l.id));
                            setNewExpenseCategory("other");
                            setNewExpensePayment("card");
                          }}
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
                        <ConfirmSubmitButton
                          locale={locale}
                          confirmMessage={t("bank_stmt_delete_line_confirm")}
                          ariaLabel={t("delete_word")}
                          className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                        >
                          <Trash2 size={16} />
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
                      <CustomSelect
                        name="category"
                        value={newExpenseCategory}
                        onChange={(v) => setNewExpenseCategory(v as ExpenseCategory)}
                        options={categories.map((k) => ({ value: k, label: categoryLabels[k] }))}
                        className={inputClass}
                      />
                      <CustomSelect
                        name="payment_method"
                        value={newExpensePayment}
                        onChange={(v) => setNewExpensePayment(v as "card" | "bank_transfer")}
                        options={(["card", "bank_transfer"] as const).map((k) => ({ value: k, label: paymentLabels[k] }))}
                        className={inputClass}
                      />
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
        <div className="rounded-xl border border-dashed border-fleet-coral bg-fleet-coral/10 p-4">
          <div className="mb-1 text-sm font-bold text-fleet-coral-text">{t("bank_stmt_scan_gap_title")}</div>
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
                  <div className="shrink-0 font-bold text-fleet-navy">{formatCurrency(r.amount)}</div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditingRecordKey(item.key)}
                      aria-label="edit"
                      className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label="archive"
                      title={t("recon_archive_record")}
                      className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-brass"
                      onClick={() => archiveRecord(r.recordType, r.id)}
                    >
                      <Archive size={14} />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label="delete"
                      className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                      onClick={() => deleteRecord(r.recordType, r.id, t("bank_stmt_delete_gap_confirm", { type: lineTypeLabels[r.recordType] }))}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDismissedItemKeys((s) => new Set(s).add(item.key))}
                    aria-label="dismiss"
                    title={t("bank_stmt_scan_gap_dismiss")}
                    className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {archivedItems.length > 0 && (
        <details
          ref={archivedRef}
          open={archivedOpen}
          onToggle={(e) => setArchivedOpen(e.currentTarget.open)}
          className="rounded-xl border border-fleet-border bg-white p-3"
        >
          <summary className="cursor-pointer text-xs font-bold text-fleet-ink">
            {t("recon_archived_title", { count: archivedItems.length })}
          </summary>
          <p className="mt-1 text-xs text-fleet-ink/70">{t("recon_archived_hint")}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {archivedItems.map((item) => {
              const r = item.appRecords[0];
              return (
                <div key={item.key} className="flex items-center gap-3 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{r.description || lineTypeLabels[r.recordType]}</div>
                    <div className="text-fleet-ink" dir="ltr">{formatDateDisplay(r.date)}</div>
                  </div>
                  <div className="shrink-0 font-bold text-fleet-navy">{formatCurrency(r.amount)}</div>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label="unarchive"
                      title={t("recon_unarchive_record")}
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                      onClick={() => unarchiveRecord(r.recordType, r.id)}
                    >
                      <ArchiveRestore size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {matchedItems.length > 0 && (
        <details className="rounded-xl border border-fleet-border bg-white p-3">
          <summary className="cursor-pointer text-xs font-bold text-fleet-moss-text">{t("bank_stmt_matched_title", { count: matchedItems.length })}</summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {matchedItems.map((item) => {
              const l = item.bankLines[0];
              return (
                <div key={item.key} className="flex items-center gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs">
                  <CheckCircle2 size={14} className="shrink-0 text-fleet-moss-text" />
                  <span className="flex-1 truncate">{l.description}</span>
                  <span className="text-fleet-ink">{lineTypeLabels[l.lineType]}</span>
                  <span className="text-fleet-ink" dir="ltr">{formatDateDisplay(l.date)}</span>
                  <span className="font-bold text-fleet-navy">{formatCurrency(l.amount)}</span>
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
                  <span className="font-bold text-fleet-navy">{formatCurrency(l.amount)}</span>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={busyLineId === item.key}
                      onClick={() =>
                        runQuickAction(item.key, async () => {
                          const fd = new FormData();
                          fd.set("description", t("recon_status_bank_fee"));
                          fd.set("category", "bank_fees");
                          fd.set("payment_method", "bank_transfer");
                          await createExpenseFromStatementLine(boatId, l.id, fd);
                        })
                      }
                      className="shrink-0 rounded-full bg-fleet-navy px-2.5 py-1 text-2xs font-semibold text-fleet-paper hover:opacity-90 disabled:opacity-60"
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
