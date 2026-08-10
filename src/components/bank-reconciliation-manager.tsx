"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  importBankStatementLines,
  createExpenseFromStatementLine,
  adoptStatementLineIntoRecord,
  archiveReconciliationRecord,
  deleteReconciliationRecord,
  deleteBankStatementFile,
  renameBankStatementFile,
} from "@/lib/actions/bank-statement";
import { createExpense } from "@/lib/actions/expenses";
import { createCashTransaction } from "@/lib/actions/cash";
import { createIncome } from "@/lib/actions/incomes";
import { RippleLoader } from "@/components/ripple-loader";
import { UploadButton } from "@/components/upload-button";
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

type ScanUnmatchedExisting = { record_id: string; record_type: BankStmtLineType; description: string; amount: number; date: string };
type ScanMatch = {
  record_id: string;
  record_type: BankStmtLineType;
  amount: number;
  date: string;
  mismatch: "date" | "amount" | "cross_type" | "split";
  // Only set for a "split" mismatch: every record the combo is made of, so
  // she can actually see what's being proposed instead of a bare count.
  splitRecords?: ScanUnmatchedExisting[];
};
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
  // Accepted for prop-contract compatibility with the caller, which still
  // computes it server-side - the "view archived gaps" list that used to
  // read it was removed along with the always-on discrepancy tables below.
  archivedItems: _archivedItems = [],
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
  const router = useRouter();

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
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [exactMatchCount, setExactMatchCount] = useState(() => readScanCache(scanCacheKey).exactMatchCount);
  const [scanUnmatchedExisting, setScanUnmatchedExisting] = useState<ScanUnmatchedExisting[]>(
    () => readScanCache(scanCacheKey).scanUnmatchedExisting
  );
  const [editingGapId, setEditingGapId] = useState<string | null>(null);
  const [savingGap, setSavingGap] = useState(false);
  const [savedGap, setSavedGap] = useState(false);
  const [selectedScanIndices, setSelectedScanIndices] = useState<Set<number>>(new Set());
  const [bulkScanApplying, setBulkScanApplying] = useState(false);
  const [expandedSplitIndices, setExpandedSplitIndices] = useState<Set<number>>(new Set());
  const toggleSplitExpanded = (i: number) =>
    setExpandedSplitIndices((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const [statementName, setStatementName] = useState("");

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
    router.refresh();
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

  // Every action wrapped here writes to the DB via a server action, which
  // calls revalidatePath - but that only invalidates the Next.js cache for
  // the NEXT navigation, it does not by itself re-render this already-
  // mounted client page. A plain onClick handler (as opposed to a real
  // <form action={serverActionReference}>) doesn't get the framework's
  // automatic post-Action refresh either, so without an explicit
  // router.refresh() here the reconciliation status shown on screen goes
  // stale after every single accept/link/create action - the record is
  // correctly saved and linked in the database, but she keeps seeing the
  // pre-action snapshot until a manual page reload.
  const runQuickAction = async (lineId: string, fn: () => Promise<void>) => {
    setBusyLineId(lineId);
    try {
      await fn();
      router.refresh();
    } finally {
      setBusyLineId(null);
    }
  };

  const [actionError, setActionError] = useState<string | null>(null);
  // Shared by every onClick-driven delete in this component (as opposed to
  // a <form>-submitted one, which already uses ConfirmSubmitButton) - these
  // used window.confirm() before, which is a jarring, LTR OS-chrome dialog
  // in an otherwise RTL Hebrew app and inconsistent with the in-app modal
  // used everywhere else for a destructive confirmation.
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; run: () => void } | null>(null);
  const visibleItems = reconciliationItems;

  const archiveRecord = async (recordType: BankStmtLineType, recordId: string) => {
    setActionError(null);
    try {
      await archiveReconciliationRecord(boatId, recordType, recordId);
      router.refresh();
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
          router.refresh();
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
  const [renamedFileId, setRenamedFileId] = useState<string | null>(null);
  const renameStatementFile = async (fileId: string, fileName: string) => {
    setRenamingFileId(fileId);
    setActionError(null);
    try {
      await renameBankStatementFile(boatId, fileId, fileName);
      router.refresh();
      setRenamingFileId(null);
      setRenamedFileId(fileId);
      setTimeout(() => {
        setRenamedFileId(null);
        setEditingFileId(null);
      }, 900);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      setRenamingFileId(null);
    }
  };

  const { matchedItems, bankFeeItems } = useMemo(() => {
    const byStatus = <S extends ReconciliationStatus>(status: S) => visibleItems.filter((item) => item.status === status);
    return {
      matchedItems: byStatus("matched"),
      bankFeeItems: byStatus("bank_fee"),
    };
  }, [visibleItems]);

  return (
    <div className="flex flex-col gap-4">
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
          <UploadButton
            onClick={() => fileRef.current?.click()}
            dropHandlers={dropHandlers}
            dragging={dragging}
            busy={scanning}
            label={t("bank_stmt_upload_cta")}
            busyLabel={t("scanning")}
            disabled={scanning}
          />
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
              <div className="animate-expand-in mt-2 flex flex-col gap-1.5">
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
                          disabled={renamingFileId === f.id || renamedFileId === f.id}
                          aria-label={t("save_word")}
                          className="flex h-7 w-7 shrink-0 items-center justify-center text-fleet-teal disabled:opacity-60"
                        >
                          {renamingFileId === f.id ? (
                            <RippleLoader size="sm" />
                          ) : (
                            <CheckCircle2 size={14} className={renamedFileId === f.id ? "animate-pop-in text-fleet-moss-text" : undefined} />
                          )}
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
                        {l.match.mismatch === "split" && l.match.splitRecords && l.match.splitRecords.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleSplitExpanded(i)}
                            aria-label={t(expandedSplitIndices.has(i) ? "recon_split_hide_records" : "recon_split_show_records")}
                            title={t(expandedSplitIndices.has(i) ? "recon_split_hide_records" : "recon_split_show_records")}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fleet-coral-text hover:bg-fleet-coral/15"
                          >
                            {expandedSplitIndices.has(i) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
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
                      {l.match.mismatch === "split" && expandedSplitIndices.has(i) && l.match.splitRecords && (
                        <div className="animate-expand-in flex flex-col gap-1">
                          {l.match.splitRecords.map((r) => (
                            <div
                              key={r.record_id}
                              className="flex items-center gap-3 rounded-lg bg-white/60 px-2 py-1"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate">{r.description}</div>
                                <div className="text-fleet-ink" dir="ltr">
                                  {formatDateDisplay(r.date)}
                                </div>
                              </div>
                              <div className="shrink-0 font-bold text-fleet-navy">{formatCurrency(r.amount)}</div>
                            </div>
                          ))}
                        </div>
                      )}
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
                    router.refresh();
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
                    setSavingGap(true);
                    await adoptStatementLineIntoRecord(boatId, null, r.record_type, r.record_id, {
                      description: String(formData.get("description") ?? "").trim(),
                      amount: Number(formData.get("amount") ?? r.amount),
                      tx_date: String(formData.get("tx_date") ?? r.date),
                    });
                    setSavingGap(false);
                    setSavedGap(true);
                    setTimeout(() => {
                      setSavedGap(false);
                      setScanUnmatchedExisting((rs) => rs.filter((x) => x.record_id !== r.record_id));
                      setEditingGapId(null);
                    }, 1200);
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
                    <button
                      type="submit"
                      disabled={savingGap || savedGap}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-fleet-teal py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {savingGap ? (
                        <RippleLoader size="sm" />
                      ) : savedGap ? (
                        <span className="flex animate-pop-in items-center gap-1">{t("saved_word")}</span>
                      ) : (
                        t("save_word")
                      )}
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

      {matchedItems.length > 0 && (
        <details className="rounded-xl border border-fleet-border bg-white p-3">
          <summary className="cursor-pointer text-xs font-bold text-fleet-moss-text">{t("bank_stmt_matched_title", { count: matchedItems.length })}</summary>
          <div className="animate-expand-in mt-2 flex flex-col gap-1.5">
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
          <div className="animate-expand-in mt-2 flex flex-col gap-1.5">
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
