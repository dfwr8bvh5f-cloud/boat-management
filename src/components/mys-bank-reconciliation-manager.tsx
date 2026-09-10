"use client";

import { useEffect, useRef, useState } from "react";
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
  ReceiptEuro,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  importMysBankStatementLines,
  adoptMysStatementLineIntoExpense,
  archiveMysExpense,
  unarchiveMysExpense,
  deleteMysBankStatementFile,
  renameMysBankStatementFile,
} from "@/lib/actions/mys-bank-statement";
import { createMysExpense, deleteMysExpense } from "@/lib/actions/mys";
import { RippleLoader } from "@/components/ripple-loader";
import { UploadButton } from "@/components/upload-button";
import { CustomSelect } from "@/components/custom-select";
import { formatDateDisplay } from "@/lib/date-format";
import { MAX_SCAN_FILE_BYTES, isPdfUrl } from "@/lib/upload";
import { useFileDrop } from "@/lib/use-file-drop";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { ReconciliationStatus } from "@/lib/reconciliation-engine";
import type { BankStmtLineType, MysExpenseCategory, PaymentMethod } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";
import { formatCurrency } from "@/lib/money";

// Adapted from bank-reconciliation-manager.tsx (boats) for MYS's own
// expenses - see supabase/migrations/0078_mys_bank_reconciliation.sql and
// src/lib/actions/mys-bank-statement.ts. Simplified relative to the boat
// version in ways that follow directly from having exactly one ledger
// (mys_expenses, not three) and no boat_id:
// - no line-type selector - a scanned line either matches/creates a
//   mys_expenses row (line_type "expense") or, for an income/cash-typed
//   line (nothing to reconcile it against in v1 - see 0078's header
//   comment), can only be dismissed, not filed anywhere.
// - no cross-type or split-match mismatch kind, since there's only one
//   record type for a match to be "cross" against or split across.
// - the "boat_payment" category is intentionally left out of the inline
//   quick-add category list here: it needs a client picker and markup %
//   that don't belong in a one-line reconciliation row - an expense that
//   should be a boat_payment charge can still be re-categorized afterward
//   from the main MYS Expenses list, which has the full form.

export type MysReconItemBankLine = { id: string; description: string; date: string; amount: number };
export type MysReconItemAppRecord = {
  id: string;
  description: string;
  date: string;
  amount: number;
  fromArchive?: boolean;
  receiptUrl?: string | null;
  receiptPath: string | null;
};
export type MysReconciliationItem = {
  key: string;
  status: ReconciliationStatus;
  confidence: number;
  bankLines: MysReconItemBankLine[];
  appRecords: MysReconItemAppRecord[];
  differenceAmount: number;
  notes: string;
};
export type MysArchivedRecordView = {
  id: string;
  description: string;
  date: string;
  amount: number;
  receiptUrl?: string | null;
  receiptPath: string | null;
};

type ScanUnmatchedExisting = { record_id: string; description: string; amount: number; date: string; receipt_path: string | null };
type ScanMatch = { record_id: string; amount: number; date: string; mismatch: "date" | "amount"; receipt_path: string | null };
type ParsedLine = {
  date: string;
  description: string;
  amount: number;
  line_type: BankStmtLineType;
  status?: "review" | "new";
  match?: ScanMatch;
  isBankFee?: boolean;
  category?: MysExpenseCategory;
  payment_method?: PaymentMethod;
};

const SCAN_CACHE_KEY = "mys_bank_scan_preview";

function readScanCache(): { parsedLines: ParsedLine[] | null; exactMatchCount: number; scanUnmatchedExisting: ScanUnmatchedExisting[] } {
  try {
    const raw = sessionStorage.getItem(SCAN_CACHE_KEY);
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

export type MysExpenseReconciliationFlag = {
  type: "date_mismatch" | "amount_mismatch" | "missing" | "matched";
  suggestedDate?: string;
};

export type MysStatementFile = { id: string; fileName: string; uploadedAt: string; url: string | null };

const inputClass = INPUT_CLASS;

// Only categories that don't need extra fields belong in the inline
// quick-add row on this page - see the header comment on why boat_payment
// is left out.
const QUICK_ADD_CATEGORIES: MysExpenseCategory[] = ["salaries", "taxes", "bills", "operational_supplies", "other"];

export function MysBankReconciliationManager({
  reconciliationItems,
  archivedRecords = [],
  statementFiles = [],
  categoryLabels,
  paymentLabels,
  canEdit,
  locale,
  onExpenseFlagsChange,
}: {
  reconciliationItems: MysReconciliationItem[];
  archivedRecords?: MysArchivedRecordView[];
  statementFiles?: MysStatementFile[];
  categoryLabels: Record<MysExpenseCategory, string>;
  paymentLabels: Record<PaymentMethod, string>;
  canEdit: boolean;
  locale: Locale;
  onExpenseFlagsChange?: (flags: Record<string, MysExpenseReconciliationFlag>) => void;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [parsedLines, setParsedLines] = useState<ParsedLine[] | null>(() => readScanCache().parsedLines);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [exactMatchCount, setExactMatchCount] = useState(() => readScanCache().exactMatchCount);
  const [scanUnmatchedExisting, setScanUnmatchedExisting] = useState<ScanUnmatchedExisting[]>(() => readScanCache().scanUnmatchedExisting);
  const [editingGapId, setEditingGapId] = useState<string | null>(null);
  const [savingGap, setSavingGap] = useState(false);
  const [savedGap, setSavedGap] = useState(false);
  const [selectedScanIndices, setSelectedScanIndices] = useState<Set<number>>(new Set());
  const [bulkScanApplying, setBulkScanApplying] = useState(false);
  const [statementName, setStatementName] = useState("");

  useEffect(() => {
    try {
      if (parsedLines === null) {
        sessionStorage.removeItem(SCAN_CACHE_KEY);
      } else {
        sessionStorage.setItem(SCAN_CACHE_KEY, JSON.stringify({ parsedLines, exactMatchCount, scanUnmatchedExisting }));
      }
    } catch {
      // storage unavailable/full - the preview still works, just won't survive a remount
    }
  }, [parsedLines, exactMatchCount, scanUnmatchedExisting]);

  // Same expense-flag surfacing as the boat version - see the identical
  // comment in bank-reconciliation-manager.tsx.
  useEffect(() => {
    if (!onExpenseFlagsChange) return;
    const dayDiff = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

    const flags: Record<string, MysExpenseReconciliationFlag> = {};
    for (const l of parsedLines ?? []) {
      if (l.status === "review" && l.match) {
        const type = l.match.mismatch === "date" ? "date_mismatch" : "amount_mismatch";
        flags[l.match.record_id] = { type, suggestedDate: type === "date_mismatch" ? l.date : undefined };
      }
    }
    for (const r of scanUnmatchedExisting) {
      const candidates = (parsedLines ?? []).filter(
        (l) => l.line_type === "expense" && l.amount === r.amount && l.date !== r.date && dayDiff(l.date, r.date) <= 10
      );
      const closest = candidates.length
        ? candidates.reduce((best, l) => (dayDiff(l.date, r.date) < dayDiff(best.date, r.date) ? l : best))
        : null;
      flags[r.record_id] = { type: "missing", suggestedDate: closest?.date };
    }
    for (const item of reconciliationItems) {
      const app = item.appRecords[0];
      if (!app) continue;
      if ((item.status === "needs_review" || item.status === "likely_match") && item.bankLines.length === 1 && item.appRecords.length === 1) {
        const bank = item.bankLines[0];
        const type = Math.round(bank.amount * 100) !== Math.round(app.amount * 100) ? "amount_mismatch" : "date_mismatch";
        flags[app.id] = { type, suggestedDate: type === "date_mismatch" ? bank.date : undefined };
      } else if (item.status === "missing_in_bank") {
        flags[app.id] = { type: "missing" };
      } else if (item.status === "matched") {
        flags[app.id] = { type: "matched" };
      }
    }
    onExpenseFlagsChange(flags);
  }, [parsedLines, scanUnmatchedExisting, reconciliationItems, onExpenseFlagsChange]);

  const [lastScannedFile, setLastScannedFile] = useState<File | null>(null);

  const runScan = async (file: File, skipSave: boolean) => {
    setScanError(null);
    setParsedLines(null);
    setExactMatchCount(0);
    setScanUnmatchedExisting([]);
    setSelectedScanIndices(new Set());
    setLastScannedFile(file);
    if (file.size > MAX_SCAN_FILE_BYTES) {
      setScanError(t("scan_file_too_large"));
      return;
    }
    setScanning(true);
    try {
      const body = new FormData();
      body.set("file", file);
      if (skipSave) body.set("skip_save", "1");
      else if (statementName.trim()) body.set("statement_name", statementName.trim());
      const res = await fetch("/api/scan-mys-bank-statement", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanError(data.error ?? t("scan_fail"));
        return;
      }
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
  const rescanSavedFile = async (f: MysStatementFile) => {
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

  const resetAndRescan = () => {
    if (!lastScannedFile || scanning) return;
    return runScan(lastScannedFile, true);
  };

  const acceptScanCorrection = (i: number) =>
    runQuickAction(`preview-${i}`, async () => {
      const l = parsedLines?.[i];
      if (!l?.match) return;
      await adoptMysStatementLineIntoExpense(null, l.match.record_id, { tx_date: l.date, amount: l.amount });
      removeParsedLine(i);
    });

  const toggleScanSelected = (i: number) =>
    setSelectedScanIndices((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const applyBulkScanCorrections = async () => {
    setBulkScanApplying(true);
    const indices = [...selectedScanIndices].sort((a, b) => b - a);
    for (const i of indices) {
      const l = parsedLines?.[i];
      if (!l) continue;
      if (l.status === "review" && l.match) {
        await adoptMysStatementLineIntoExpense(null, l.match.record_id, { tx_date: l.date, amount: l.amount });
      } else if (l.status === "new" && l.line_type === "expense") {
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
  const setParsedLineDate = (i: number, date: string) =>
    setParsedLines((ls) => (ls ? ls.map((l, idx) => (idx === i ? { ...l, date } : l)) : ls));
  const setParsedLineDescription = (i: number, description: string) =>
    setParsedLines((ls) => (ls ? ls.map((l, idx) => (idx === i ? { ...l, description } : l)) : ls));
  const setParsedLineAmount = (i: number, amount: number) =>
    setParsedLines((ls) => (ls ? ls.map((l, idx) => (idx === i ? { ...l, amount } : l)) : ls));
  const setParsedLineCategory = (i: number, category: MysExpenseCategory) =>
    setParsedLines((ls) => (ls ? ls.map((l, idx) => (idx === i ? { ...l, category } : l)) : ls));
  const setParsedLinePaymentMethod = (i: number, payment_method: PaymentMethod) =>
    setParsedLines((ls) => (ls ? ls.map((l, idx) => (idx === i ? { ...l, payment_method } : l)) : ls));

  const createRecordFromLine = async (l: ParsedLine) => {
    const fd = new FormData();
    fd.set("description", l.description);
    fd.set("amount", String(l.amount));
    fd.set("category", l.category ?? "other");
    fd.set("payment_method", l.payment_method ?? (l.isBankFee ? "bank_transfer" : ""));
    fd.set("expense_date", l.date);
    await createMysExpense(fd);
  };

  const acceptNewLine = (i: number) =>
    runQuickAction(`new-${i}`, async () => {
      const l = parsedLines?.[i];
      if (!l) return;
      await createRecordFromLine(l);
      removeParsedLine(i);
    });

  const dismissLine = (i: number) =>
    runQuickAction(`dismiss-${i}`, async () => {
      const l = parsedLines?.[i];
      if (!l) return;
      await importMysBankStatementLines([{ date: l.date, description: l.description, amount: l.amount, line_type: l.line_type }]);
      removeParsedLine(i);
    });

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
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; run: () => void } | null>(null);
  const visibleItems = reconciliationItems;

  const archiveRecord = async (recordId: string) => {
    setActionError(null);
    try {
      await archiveMysExpense(recordId);
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const [archivedOpen, setArchivedOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const unarchiveRecord = async (recordId: string) => {
    setActionError(null);
    try {
      await unarchiveMysExpense(recordId);
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };
  const deleteArchivedRecord = (recordId: string, receiptPath: string | null) => {
    setPendingConfirm({
      message: t("bank_stmt_delete_gap_confirm", { type: t("bank_stmt_type_expense") }),
      run: async () => {
        setActionError(null);
        try {
          await deleteMysExpense(recordId, receiptPath);
          router.refresh();
        } catch (e) {
          setActionError(e instanceof Error ? e.message : String(e));
        }
      },
    });
  };

  const [deletingStatementFileId, setDeletingStatementFileId] = useState<string | null>(null);
  const deleteStatementFile = (fileId: string) => {
    setPendingConfirm({
      message: t("recon_delete_statement_confirm"),
      run: async () => {
        setDeletingStatementFileId(fileId);
        setActionError(null);
        try {
          await deleteMysBankStatementFile(fileId);
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
      await renameMysBankStatementFile(fileId, fileName);
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

  return (
    <>
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
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => setPendingConfirm(null)}>
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
                          <div className="text-fleet-ink" dir="ltr">
                            {formatDateDisplay(f.uploadedAt.slice(0, 10))}
                          </div>
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
                  {lastScannedFile && (
                    <button
                      type="button"
                      disabled={scanning}
                      onClick={resetAndRescan}
                      title={t("recon_reset_rescan")}
                      className="flex items-center gap-1 text-2xs font-semibold text-fleet-teal underline hover:opacity-80 disabled:opacity-60"
                    >
                      <Sparkles size={12} className={scanning ? "animate-twinkle" : undefined} /> {t("recon_reset_rescan")}
                    </button>
                  )}
                  {parsedLines.some((l) => l.status === "review" && l.match) && (
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
                        setSelectedScanIndices(new Set(parsedLines.map((l, i) => ({ l, i })).filter(({ l }) => l.isBankFee).map(({ i }) => i)))
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
                        {l.line_type === "expense" ? (
                          <>
                            <CustomSelect
                              value={l.category ?? "other"}
                              onChange={(v) => setParsedLineCategory(i, v as MysExpenseCategory)}
                              options={QUICK_ADD_CATEGORIES.map((k) => ({ value: k, label: categoryLabels[k] }))}
                              className="rounded-md border border-fleet-border bg-white px-1.5 py-1 text-2xs"
                            />
                            <CustomSelect
                              value={l.payment_method ?? (l.isBankFee ? "bank_transfer" : "")}
                              onChange={(v) => setParsedLinePaymentMethod(i, v as PaymentMethod)}
                              options={(["card", "bank_transfer"] as const).map((k) => ({ value: k, label: paymentLabels[k] }))}
                              placeholder={t("not_set_yet")}
                              className="rounded-md border border-fleet-border bg-white px-1.5 py-1 text-2xs"
                            />
                          </>
                        ) : (
                          <span className="shrink-0 rounded-full bg-fleet-paper px-2 py-0.5 text-3xs font-bold text-fleet-ink">
                            {t(l.line_type === "income" ? "bank_stmt_type_income" : "bank_stmt_type_cash_withdrawal")}
                          </span>
                        )}
                      </>
                    );

                    const hintText = t(l.match?.mismatch === "date" ? "bank_stmt_date_mismatch_hint" : "bank_stmt_amount_mismatch_hint", {
                      date: l.match ? formatDateDisplay(l.match.date) : "",
                      amount: l.match ? l.match.amount.toLocaleString("he-IL") : "",
                    });

                    const isRoutineMismatch = l.match?.mismatch === "date";
                    const mismatchBg = isRoutineMismatch ? "bg-fleet-brass/10" : "bg-fleet-coral/10";
                    const mismatchBadgeClass = isRoutineMismatch ? "bg-fleet-brass/15 text-fleet-brass" : "bg-fleet-coral/15 text-fleet-coral-text";
                    const mismatchTextClass = isRoutineMismatch ? "text-fleet-brass" : "text-fleet-coral-text";

                    return l.status === "review" && l.match ? (
                      <div key={i} className={`flex flex-col gap-1.5 rounded-lg ${mismatchBg} p-2.5 text-xs`}>
                        <p className={`truncate ${mismatchTextClass}`} title={hintText}>
                          {hintText}
                        </p>
                        <div className="flex items-center gap-2 overflow-x-auto overscroll-x-contain">
                          <input
                            type="checkbox"
                            checked={selectedScanIndices.has(i)}
                            onChange={() => toggleScanSelected(i)}
                            aria-label={t("select_row_word")}
                            className="h-3.5 w-3.5 shrink-0 rounded border-fleet-border"
                          />
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-3xs font-bold ${mismatchBadgeClass}`}>
                            {t(l.match.mismatch === "date" ? "reconciliation_flag_date_mismatch" : "reconciliation_flag_amount_mismatch")}
                          </span>
                          {editableFields}
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
                            disabled={busyLineId === `dismiss-${i}`}
                            onClick={() => dismissLine(i)}
                            title={t("recon_dismiss_line")}
                            aria-label={t("recon_dismiss_line")}
                            className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text disabled:opacity-60"
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
                        {l.line_type === "expense" && (
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
                        )}
                        <button
                          type="button"
                          disabled={busyLineId === `dismiss-${i}`}
                          onClick={() => dismissLine(i)}
                          title={t("recon_dismiss_line")}
                          aria-label={t("recon_dismiss_line")}
                          className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text disabled:opacity-60"
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
                      await importMysBankStatementLines(importable);
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
                      {importing ? t("uploading_word") : t("bank_stmt_import_cta", { count: parsedLines.filter((l) => l.status !== "review").length })}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {archivedRecords.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setArchivedOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-full border border-fleet-border bg-white px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
            >
              <Archive size={14} /> {t("recon_archived_title", { count: archivedRecords.length })}
              {archivedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        )}
        {archivedOpen && (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-fleet-border bg-fleet-paper p-3">
            {archivedRecords.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg bg-white p-2.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-fleet-navy">{r.description}</div>
                  <div className="text-fleet-ink" dir="ltr">
                    {formatDateDisplay(r.date)}
                  </div>
                </div>
                <div className="shrink-0 font-bold text-fleet-navy">{formatCurrency(r.amount)}</div>
                {r.receiptUrl && (
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(r.receiptUrl ?? null)}
                    aria-label={t("view_receipt")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                  >
                    <ReceiptEuro size={14} />
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    aria-label="unarchive"
                    title={t("recon_unarchive_record")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                    onClick={() => unarchiveRecord(r.id)}
                  >
                    <ArrowLeftRight size={14} />
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    aria-label="delete"
                    title={t("delete_word")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                    onClick={() => deleteArchivedRecord(r.id, r.receiptPath)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
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
                      await adoptMysStatementLineIntoExpense(null, r.record_id, {
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
                      <div className="truncate">{r.description}</div>
                      <div className="text-fleet-ink" dir="ltr">
                        {formatDateDisplay(r.date)}
                      </div>
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
                          await archiveRecord(r.record_id);
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
                            message: t("bank_stmt_delete_gap_confirm", { type: t("bank_stmt_type_expense") }),
                            run: async () => {
                              setActionError(null);
                              try {
                                await deleteMysExpense(r.record_id, r.receipt_path);
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

        {visibleItems.length === 0 && (
          <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">{t("bank_stmt_none")}</p>
        )}
      </div>

      {lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setLightboxUrl(null)}>
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label={t("close_word")}
            className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-fleet-navy"
          >
            <X size={16} />
          </button>
          {isPdfUrl(lightboxUrl) ? (
            <iframe src={`${lightboxUrl}#view=FitH`} title="receipt" className="h-[85vh] w-[90vw] rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightboxUrl} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
    </>
  );
}
