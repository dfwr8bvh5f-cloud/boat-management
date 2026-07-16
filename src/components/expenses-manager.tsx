"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Camera, CheckCircle2, Clock, Download, Filter, Info, Pencil, Plus, Printer, ReceiptEuro, Search, ShieldCheck, Sparkles, Trash2, Upload, X } from "lucide-react";
import {
  createExpense,
  updateExpense,
  deleteExpense,
  approveExpense,
  removeExpenseReceipt,
  removeExpensePhoto,
  removeExpenseAttachment,
  updateExpenseDateOnly,
} from "@/lib/actions/expenses";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { getCategoryLabels, getExpenseCategories, getPaymentLabels, PAYMENT_METHODS } from "@/lib/labels";
import { DateInput } from "@/components/date-input";
import { CustomSelect } from "@/components/custom-select";
import { formatDateDisplay } from "@/lib/date-format";
import { MAX_SCAN_FILE_BYTES, isPdfUrl } from "@/lib/upload";
import { compressImageToLimit } from "@/lib/image-compress";
import { scanReceiptToPdf } from "@/lib/scan-to-pdf";
import { useFileDrop, setInputFilesMulti } from "@/lib/use-file-drop";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatType, Expense, ExpenseAttachmentKind, ExpenseCategory, PaymentMethod } from "@/lib/types/database";
import type { ExpenseReconciliationFlag } from "@/components/bank-reconciliation-manager";
import { INPUT_CLASS } from "@/lib/ui-classes";

type ScanResult = {
  description?: string | null;
  amount?: number | null;
  expense_date?: string | null;
  invoice_number?: string | null;
  category?: string | null;
};

type AttachmentWithUrl = { id: string; kind: ExpenseAttachmentKind; path: string; url: string };
type ExpenseWithUrl = Expense & {
  receiptUrl: string | null;
  receiptThumbUrl: string | null;
  photoUrl: string | null;
  photoThumbUrl: string | null;
  attachments: AttachmentWithUrl[];
};
type CompleteExpense = ExpenseWithUrl & { expense_date: string; payment_method: PaymentMethod };

function isCompleteExpense(e: ExpenseWithUrl): e is CompleteExpense {
  return e.expense_date != null && e.payment_method != null;
}

const inputClass = INPUT_CLASS;

function formatCurrency(n: number) {
  return `€${n.toLocaleString("he-IL")}`;
}

export function ExpensesManager({
  boatId,
  boatType,
  boatName,
  expenses,
  canAdd,
  isManagement,
  locale,
  reconciliationFlags,
}: {
  boatId: string;
  boatType: BoatType;
  boatName: string;
  expenses: ExpenseWithUrl[];
  canAdd: boolean;
  isManagement: boolean;
  locale: Locale;
  reconciliationFlags?: Record<string, ExpenseReconciliationFlag>;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const categoryLabels = getCategoryLabels(locale);
  const categories = getExpenseCategories(boatType, boatName);
  const paymentLabels = getPaymentLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExpenseWithUrl | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [payFilter, setPayFilter] = useState<string[]>([]);
  const [catFilter, setCatFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [categoryValue, setCategoryValue] = useState<ExpenseCategory | "">("");
  const [paymentMethodValue, setPaymentMethodValue] = useState<PaymentMethod | "">("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [applyingDateId, setApplyingDateId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanOk, setScanOk] = useState(false);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [removingReceipt, setRemovingReceipt] = useState(false);
  const [, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);

  // The file inputs below don't need clearing here - the form carries a
  // `key={editing?.id ?? "new"}`, so editing/closing/starting a new one
  // remounts them fresh automatically.
  const resetFileState = () => {
    setReceiptFiles([]);
    photoPreviews.forEach((u) => URL.revokeObjectURL(u));
    setPhotoFiles([]);
    setPhotoPreviews([]);
    setPhotoError(null);
  };

  const removeAttachment = async (attachment: AttachmentWithUrl) => {
    setRemovingAttachmentId(attachment.id);
    try {
      await removeExpenseAttachment(boatId, attachment.id, attachment.path);
      setEditing((prev) =>
        prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== attachment.id) } : prev
      );
    } finally {
      setRemovingAttachmentId(null);
    }
  };

  const removeExistingPhoto = async () => {
    if (!editing) return;
    setRemovingPhoto(true);
    try {
      await removeExpensePhoto(boatId, editing.id);
      setEditing((prev) => (prev ? { ...prev, photoUrl: null, photo_path: null } : prev));
    } finally {
      setRemovingPhoto(false);
    }
  };

  const onPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    const compressed = await compressImageToLimit(file, MAX_SCAN_FILE_BYTES);
    if (compressed.size > MAX_SCAN_FILE_BYTES) {
      setPhotoError(t("scan_file_too_large"));
      return;
    }
    setPhotoFiles((prev) => {
      const next = [...prev, compressed];
      if (photoRef.current) setInputFilesMulti(photoRef.current, next);
      return next;
    });
    // A visible thumbnail of the photo just taken/picked - before, the only
    // feedback was the button's own state, easy to miss and no real
    // confirmation the right photo actually attached before saving.
    setPhotoPreviews((prev) => [...prev, URL.createObjectURL(compressed)]);
  };

  const removePendingPhoto = (index: number) => {
    setPhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setPhotoFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (photoRef.current) setInputFilesMulti(photoRef.current, next);
      return next;
    });
  };

  const { dragging: photoDragging, dropHandlers: photoDropHandlers } = useFileDrop((file) => onPhotoFile(file));

  const removeExistingReceipt = async () => {
    if (!editing) return;
    setRemovingReceipt(true);
    try {
      await removeExpenseReceipt(boatId, editing.id);
      setEditing((prev) => (prev ? { ...prev, receiptUrl: null, receipt_path: null } : prev));
    } finally {
      setRemovingReceipt(false);
    }
  };

  const removePendingReceipt = (index: number) => {
    setReceiptFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (fileRef.current) setInputFilesMulti(fileRef.current, next);
      return next;
    });
  };

  const onReceiptFile = async (file: File | undefined) => {
    if (!file) return;
    // Photographed receipts/invoices are turned into a cropped-to-the-
    // document, real PDF file instead of being kept as a raw photo with
    // the desk/hand/etc still visible - see scan-to-pdf.ts for what this
    // does and doesn't handle. A file already picked as a PDF passes
    // through unchanged. That converted file is what gets attached to the
    // expense, but the AI scan itself is sent a plain compressed JPEG
    // instead - Claude reads images natively, so this avoids relying on the
    // custom PDF encoder (a hand-rolled byte format with no test coverage)
    // for a step that doesn't actually need it.
    const [compressed, forScan] = await Promise.all([
      scanReceiptToPdf(file, MAX_SCAN_FILE_BYTES),
      compressImageToLimit(file, MAX_SCAN_FILE_BYTES),
    ]);
    // Attached before any size/scan check runs, so an oversized file is
    // still kept as the expense's receipt even when it can't be scanned -
    // losing the attachment entirely used to be the only outcome here.
    setReceiptFiles((prev) => {
      const next = [...prev, compressed];
      if (fileRef.current) setInputFilesMulti(fileRef.current, next);
      return next;
    });
    if (compressed.size > MAX_SCAN_FILE_BYTES) {
      setScanOk(true);
      setScanMsg(t("scan_file_too_large_uploaded"));
      return;
    }
    setScanning(true);
    setScanMsg(null);
    try {
      const body = new FormData();
      body.set("file", forScan);
      const res = await fetch("/api/scan-receipt", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanOk(false);
        setScanMsg(data.error ?? t("scan_fail"));
        return;
      }
      // When the fields already hold real values (typically because she's
      // attaching a receipt to an expense she already filled in by hand),
      // the scan must only add the file - overwriting a value she already
      // entered/verified with whatever the AI happened to read would be a
      // silent, unwanted correction of data she already trusts.
      const result: ScanResult = data.result ?? {};
      if (result.description && descriptionRef.current && !descriptionRef.current.value.trim()) {
        descriptionRef.current.value = result.description;
      }
      if (result.amount != null && amountRef.current && !amountRef.current.value.trim()) {
        amountRef.current.value = String(result.amount);
      }
      if (result.expense_date && !dateValue) setDateValue(result.expense_date);
      if (result.invoice_number && invoiceRef.current && !invoiceRef.current.value.trim()) {
        invoiceRef.current.value = result.invoice_number;
      }
      if (result.category && !editing && categories.includes(result.category as ExpenseCategory)) {
        setCategoryValue(result.category as ExpenseCategory);
      }
      setScanOk(true);
      setScanMsg(t("scan_ok"));
    } catch {
      setScanOk(false);
      setScanMsg(t("scan_connect_fail"));
    } finally {
      setScanning(false);
    }
  };

  const { dragging: receiptDragging, dropHandlers: receiptDropHandlers } = useFileDrop((file) => onReceiptFile(file));

  const togglePayFilter = (k: string) =>
    setPayFilter((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const toggleCatFilter = (k: string) =>
    setCatFilter((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  const pendingDrafts = expenses.filter((e) => !isCompleteExpense(e));
  const completeExpenses = expenses.filter(isCompleteExpense);

  const searchTerm = search.trim().toLowerCase();
  const filtered = completeExpenses.filter(
    (e) =>
      (payFilter.length === 0 || payFilter.includes(e.payment_method)) &&
      (catFilter.length === 0 || (e.category != null && catFilter.includes(e.category))) &&
      (fromDate === "" || e.expense_date >= fromDate) &&
      (toDate === "" || e.expense_date <= toDate) &&
      (searchTerm === "" ||
        e.description.toLowerCase().includes(searchTerm) ||
        String(e.amount).includes(searchTerm) ||
        (e.invoice_number ?? "").toLowerCase().includes(searchTerm) ||
        (e.notes ?? "").toLowerCase().includes(searchTerm))
  );
  const activeFilterCount = payFilter.length + catFilter.length + (fromDate ? 1 : 0) + (toDate ? 1 : 0);

  const exportCsv = () => {
    const header = [t("date"), t("description"), t("category"), t("payment_method"), t("amount")];
    const csvEscape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = filtered.map((e) =>
      [e.expense_date, e.description, e.category ? categoryLabels[e.category] : t("not_set_yet"), paymentLabels[e.payment_method], String(e.amount)]
        .map(csvEscape)
        .join(",")
    );
    const csv = "﻿" + [header.map(csvEscape).join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "expenses.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const startEdit = (e: ExpenseWithUrl) => {
    setEditing(e);
    setShowForm(true);
    setScanMsg(null);
    setSaveError(null);
    setDateValue(e.expense_date ?? "");
    setCategoryValue(e.category ?? "");
    setPaymentMethodValue(e.payment_method ?? "");
    resetFileState();
  };
  const startNew = () => {
    setEditing(null);
    setShowForm((s) => (editing ? true : !s));
    setScanMsg(null);
    setSaveError(null);
    setDateValue("");
    setCategoryValue("");
    setPaymentMethodValue("");
    resetFileState();
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setScanMsg(null);
    setSaveError(null);
    resetFileState();
  };

  const formAction = editing ? updateExpense.bind(null, boatId, editing.id) : createExpense.bind(null, boatId);

  const renderExpenseForm = () => (
    <form
      key={editing?.id ?? "new"}
      onSubmit={async (e) => {
        e.preventDefault();
        setSaveError(null);
        setSaving(true);
        const formData = new FormData(e.currentTarget);
        try {
          await formAction(formData);
          closeForm();
        } catch (err) {
          // A thrown error here used to crash the whole page (Next's
          // generic error boundary), which made every typed field vanish
          // with zero explanation. Now it just shows the real reason and
          // leaves the form exactly as typed, ready to retry.
          setSaveError(err instanceof Error ? err.message : t("save_failed"));
        } finally {
          setSaving(false);
        }
      }}
      className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("receipt_invoice_label")}</label>
        <input
          ref={fileRef}
          type="file"
          name="receipts"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={async (e) => {
            for (const file of Array.from(e.target.files ?? [])) await onReceiptFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          {...receiptDropHandlers}
          className={`relative flex w-fit items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-fleet-navy disabled:opacity-60 ${
            receiptDragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-brass bg-fleet-paper"
          }`}
        >
          {scanning ? <Sparkles size={15} className="animate-twinkle" /> : <Upload size={15} />}{" "}
          {scanning ? t("scanning") : t("scan_upload")}
          {receiptDragging && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
              <Plus size={18} className="text-fleet-teal" />
            </span>
          )}
        </button>
        {scanMsg && (
          <div className={`flex items-center gap-1 text-xs ${scanOk ? "text-fleet-moss" : "text-fleet-coral"}`}>
            <Sparkles size={12} /> {scanMsg}
          </div>
        )}
        {receiptFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {receiptFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-2.5 py-1.5 text-xs">
                <ReceiptEuro size={13} className="text-fleet-navy" />
                <span className="max-w-[100px] truncate">{f.name}</span>
                <button type="button" onClick={() => removePendingReceipt(i)} aria-label={t("remove_word")} className="text-fleet-ink hover:text-fleet-coral">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {editing && (editing.attachments.some((a) => a.kind === "receipt") ? (
          <div className="flex flex-wrap gap-2">
            {editing.attachments
              .filter((a) => a.kind === "receipt")
              .map((a) => (
                <div key={a.id} className="relative w-fit">
                  {isPdfUrl(a.url) ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-sm text-fleet-navy"
                    >
                      <ReceiptEuro size={15} /> {t("view_receipt")}
                    </a>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt="" className="max-h-24 rounded-lg border border-fleet-border" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(a)}
                    disabled={removingAttachmentId === a.id}
                    aria-label={t("remove_word")}
                    className="absolute -end-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-fleet-ink/70 text-white hover:bg-fleet-coral disabled:opacity-60"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
          </div>
        ) : (
          editing.receiptUrl && (
            <div className="relative w-fit">
              {isPdfUrl(editing.receiptUrl) ? (
                <a
                  href={editing.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-sm text-fleet-navy"
                >
                  <ReceiptEuro size={15} /> {t("view_receipt")}
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editing.receiptThumbUrl ?? editing.receiptUrl} alt="" className="max-h-24 rounded-lg border border-fleet-border" />
              )}
              <button
                type="button"
                onClick={removeExistingReceipt}
                disabled={removingReceipt}
                aria-label={t("remove_word")}
                className="absolute -end-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-fleet-ink/70 text-white hover:bg-fleet-coral disabled:opacity-60"
              >
                <X size={13} />
              </button>
            </div>
          )
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("description")} *</label>
        <input ref={descriptionRef} name="description" required defaultValue={editing?.description} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("category")}</label>
          <CustomSelect
            name="category"
            value={categoryValue}
            onChange={(v) => setCategoryValue(v as ExpenseCategory | "")}
            options={[{ value: "", label: t("not_set_yet") }, ...categories.map((k) => ({ value: k, label: categoryLabels[k] }))]}
            placeholder={t("not_set_yet")}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("payment_method")}</label>
          <CustomSelect
            name="payment_method"
            value={paymentMethodValue}
            onChange={(v) => setPaymentMethodValue(v as PaymentMethod | "")}
            options={[{ value: "", label: t("not_set_yet") }, ...PAYMENT_METHODS.map((k) => ({ value: k, label: paymentLabels[k] }))]}
            placeholder={t("not_set_yet")}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("amount")} *</label>
          <input
            ref={amountRef}
            name="amount"
            type="number"
            step="0.01"
            required
            defaultValue={editing?.amount}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("date")}</label>
          <DateInput name="expense_date" value={dateValue} onChange={setDateValue} locale={locale} className={inputClass} allowClear />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("invoice_number")}</label>
        <input ref={invoiceRef} name="invoice_number" defaultValue={editing?.invoice_number ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("expense_photo_label")}</label>
        <input
          ref={photoRef}
          type="file"
          name="photos"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            for (const file of Array.from(e.target.files ?? [])) await onPhotoFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => photoRef.current?.click()}
          {...photoDropHandlers}
          className={`relative flex w-fit items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-fleet-navy ${
            photoDragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-brass bg-fleet-paper"
          }`}
        >
          <Camera size={15} /> {t("take_photo")}
          {photoDragging && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
              <Plus size={18} className="text-fleet-teal" />
            </span>
          )}
        </button>
        {photoError && <p className="text-xs text-fleet-coral">{photoError}</p>}
        {photoPreviews.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photoPreviews.map((url, i) => (
              <div key={url} className="relative w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-16 w-16 rounded-lg border border-fleet-border object-cover" />
                <button
                  type="button"
                  onClick={() => removePendingPhoto(i)}
                  aria-label={t("remove_word")}
                  className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-fleet-ink/70 text-white hover:bg-fleet-coral"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        {editing && (editing.attachments.some((a) => a.kind === "photo") ? (
          <div className="flex flex-wrap gap-2">
            {editing.attachments
              .filter((a) => a.kind === "photo")
              .map((a) => (
                <div key={a.id} className="relative w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" className="max-h-24 rounded-lg border border-fleet-border" />
                  <button
                    type="button"
                    onClick={() => removeAttachment(a)}
                    disabled={removingAttachmentId === a.id}
                    aria-label={t("remove_word")}
                    className="absolute -end-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-fleet-ink/70 text-white hover:bg-fleet-coral disabled:opacity-60"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
          </div>
        ) : (
          editing.photoUrl && (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={editing.photoThumbUrl ?? editing.photoUrl} alt="" className="max-h-24 rounded-lg border border-fleet-border" />
            <button
              type="button"
              onClick={removeExistingPhoto}
              disabled={removingPhoto}
              aria-label={t("remove_word")}
              className="absolute -end-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-fleet-ink/70 text-white hover:bg-fleet-coral disabled:opacity-60"
            >
              <X size={13} />
            </button>
          </div>
          )
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
        <textarea name="notes" rows={2} defaultValue={editing?.notes ?? ""} className={inputClass} />
      </div>
      <label className="flex items-center gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-sm text-fleet-navy">
        <input type="checkbox" name="is_warranty" defaultChecked={editing?.is_warranty ?? false} className="h-4 w-4" />
        <ShieldCheck size={15} className="text-fleet-brass" /> {t("is_warranty_label")}
      </label>
      {saveError && <p className="text-xs text-fleet-coral">{saveError}</p>}
      <div className="flex gap-2">
        {editing && (
          <button
            type="button"
            onClick={closeForm}
            className="flex-1 rounded-lg border border-fleet-border py-2.5 text-sm font-bold text-fleet-ink hover:bg-fleet-paper"
          >
            {t("close_word")}
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? t("saving_word") : editing ? t("save_edit") : t("add_expense")}
        </button>
      </div>
    </form>
  );

  const reconciliationFlagLabels: Record<ExpenseReconciliationFlag["type"], string> = {
    date_mismatch: t("reconciliation_flag_date_mismatch"),
    amount_mismatch: t("reconciliation_flag_amount_mismatch"),
    missing: t("reconciliation_flag_missing"),
    matched: t("reconciliation_flag_matched"),
  };

  const applySuggestedDate = async (expenseId: string, suggestedDate: string) => {
    setApplyingDateId(expenseId);
    try {
      await updateExpenseDateOnly(boatId, expenseId, suggestedDate);
    } finally {
      setApplyingDateId(null);
    }
  };

  const renderExpenseRow = (e: ExpenseWithUrl) => {
    const flag = reconciliationFlags?.[e.id];
    return editing?.id === e.id ? (
      <div key={e.id}>{renderExpenseForm()}</div>
    ) : (
      <div
        key={e.id}
        className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
          flag?.type === "matched"
            ? "border-fleet-moss bg-fleet-moss/15"
            : flag
              ? "border-fleet-coral bg-fleet-coral/5"
              : isCompleteExpense(e)
                ? "border-fleet-border bg-white"
                : "border-dashed border-fleet-brass bg-fleet-paper"
        }`}
      >
        {isCompleteExpense(e) ? (
          <ApprovalIndicator value={e.status} locale={locale} />
        ) : (
          <Clock size={16} className="shrink-0 text-fleet-brass" aria-label={t("pending")} />
        )}
        <div className="min-w-[140px] flex-1">
          <div className="flex items-center gap-1 text-sm">
            {e.is_warranty && <ShieldCheck size={13} className="shrink-0 text-fleet-brass" aria-label={t("is_warranty_label")} />}
            {e.description}
          </div>
          {e.invoice_number && (
            <div className="text-xs text-fleet-ink" dir="ltr">
              INV# {e.invoice_number}
            </div>
          )}
          <div className="text-xs text-fleet-ink">
            {e.expense_date ? <span dir="ltr">{formatDateDisplay(e.expense_date)}</span> : t("not_set_yet")}
          </div>
          {flag && flag.type === "matched" ? (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-fleet-moss">
              <CheckCircle2 size={12} /> {reconciliationFlagLabels[flag.type]}
            </div>
          ) : flag ? (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-fleet-coral">
              <AlertTriangle size={12} /> {reconciliationFlagLabels[flag.type]}
              {flag.suggestedDate && (
                <button
                  type="button"
                  disabled={applyingDateId === e.id}
                  onClick={() => applySuggestedDate(e.id, flag.suggestedDate as string)}
                  title={t("reconciliation_apply_suggested_date", { date: formatDateDisplay(flag.suggestedDate) })}
                  className="flex items-center gap-1 rounded-full border border-fleet-coral px-2 py-0.5 font-semibold text-fleet-coral hover:bg-fleet-coral/10 disabled:opacity-60"
                >
                  <ArrowLeftRight size={11} /> <span dir="ltr">{formatDateDisplay(flag.suggestedDate)}</span>
                </button>
              )}
            </div>
          ) : null}
          <div className="flex items-center gap-1 text-xs text-fleet-ink">
            <span>
              {e.category ? categoryLabels[e.category] : t("not_set_yet")}
              {e.payment_method ? ` · ${paymentLabels[e.payment_method]}` : ""}
            </span>
            {e.notes && (
              <button
                type="button"
                onClick={() => setOpenNoteId((id) => (id === e.id ? null : e.id))}
                aria-label={t("note")}
                className="text-fleet-brass"
              >
                <Info size={12} />
              </button>
            )}
          </div>
          {e.notes && openNoteId === e.id && <div className="mt-0.5 text-xs text-fleet-ink italic">{e.notes}</div>}
        </div>
        {e.receiptUrl && (
          <button
            type="button"
            onClick={() => setLightboxUrl(e.receiptUrl)}
            aria-label={t("view_receipt")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-fleet-border bg-fleet-paper text-fleet-brass hover:bg-white"
          >
            <ReceiptEuro size={16} />
          </button>
        )}
        {e.photoUrl && (
          <button
            type="button"
            onClick={() => setLightboxUrl(e.photoUrl)}
            aria-label={t("view_photo")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-fleet-border bg-fleet-paper text-fleet-brass hover:bg-white"
          >
            <Camera size={16} />
          </button>
        )}
        <div className="font-bold text-fleet-navy">{formatCurrency(e.amount)}</div>
        {isManagement && e.status === "pending" && (
          <form action={approveExpense.bind(null, boatId, e.id)}>
            <ConfirmSubmitButton className="text-xs font-bold text-fleet-moss hover:underline">
              {t("approve")}
            </ConfirmSubmitButton>
          </form>
        )}
        <div className="flex flex-col items-center gap-1.5">
          {canAdd && (
            <button onClick={() => startEdit(e)} aria-label="edit" className="text-fleet-ink hover:text-fleet-navy">
              <Pencil size={16} />
            </button>
          )}
          {(canAdd || (isManagement && e.status === "pending")) && (
            <form action={deleteExpense.bind(null, boatId, e.id, e.receipt_path, e.photo_path)}>
              <ConfirmSubmitButton
                confirmMessage={e.status === "pending" ? t("reject_expense_confirm") : t("delete_expense_confirm")}
                className="text-fleet-ink hover:text-fleet-coral"
              >
                <Trash2 size={16} />
              </ConfirmSubmitButton>
            </form>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
    <div className="flex flex-col gap-4 print:hidden">
      {canAdd && (
        <div className="flex justify-end">
          <button
            onClick={startNew}
            className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
          >
            {showForm ? `✕ ${t("close_word")}` : `+ ${t("add_expense")}`}
          </button>
        </div>
      )}

      {showForm && canAdd && !editing && renderExpenseForm()}

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fleet-ink" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_placeholder")}
          className="w-full rounded-lg border border-fleet-border bg-white py-2 ps-9 pe-3 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
        >
          <Download size={13} /> {t("export_excel")}
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
        >
          <Printer size={13} /> {t("export_print")}
        </button>
      </div>

      <div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
            activeFilterCount > 0 ? "border-fleet-teal text-fleet-teal" : "border-fleet-border text-fleet-navy"
          }`}
        >
          <Filter size={13} /> {t("expense_filters")}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
        {showFilters && (
          <div className="mt-2 flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-3">
            <div>
              <div className="mb-1.5 text-[11px] font-bold text-fleet-ink">{t("from_date")} - {t("to_date")}</div>
              <div className="grid grid-cols-2 gap-2">
                <DateInput
                  value={fromDate}
                  onChange={setFromDate}
                  locale={locale}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-2.5 py-1.5 text-start text-xs outline-none focus:border-fleet-teal"
                />
                <DateInput
                  value={toDate}
                  onChange={setToDate}
                  locale={locale}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-2.5 py-1.5 text-start text-xs outline-none focus:border-fleet-teal"
                />
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-bold text-fleet-ink">{t("payment_method")}</div>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map((k) => (
                  <button
                    key={k}
                    onClick={() => togglePayFilter(k)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                      payFilter.includes(k) ? "border-fleet-teal bg-fleet-teal text-white" : "border-fleet-border"
                    }`}
                  >
                    {paymentLabels[k]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-bold text-fleet-ink">{t("category")}</div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((k) => (
                  <button
                    key={k}
                    onClick={() => toggleCatFilter(k)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                      catFilter.includes(k) ? "border-fleet-teal bg-fleet-teal text-white" : "border-fleet-border"
                    }`}
                  >
                    {categoryLabels[k]}
                  </button>
                ))}
              </div>
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setPayFilter([]);
                  setCatFilter([]);
                  setFromDate("");
                  setToDate("");
                }}
                className="w-fit text-xs text-fleet-coral"
              >
                {t("expense_filters_clear")}
              </button>
            )}
          </div>
        )}
      </div>

      {pendingDrafts.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-fleet-brass bg-fleet-paper/60 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fleet-brass">
            <Clock size={14} /> {t("pending_drafts_title")} ({pendingDrafts.length})
          </div>
          <p className="text-[11px] text-fleet-ink">{t("pending_drafts_hint")}</p>
          <div className="flex flex-col gap-2">{pendingDrafts.map((e) => renderExpenseRow(e))}</div>
        </div>
      )}

      {filtered.length > 0 && pendingDrafts.length > 0 && (
        <div className="text-xs font-bold text-fleet-ink">{t("completed_expenses_title")}</div>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("none_expenses")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">{filtered.map((e) => renderExpenseRow(e))}</div>
      )}
    </div>

    <table className="hidden w-full border-collapse text-sm print:table">
      <thead>
        <tr>
          <th className="border border-fleet-border p-1.5 text-start">{t("date")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("description")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("category")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("payment_method")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("amount")}</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((e) => (
          <tr key={e.id}>
            <td className="border border-fleet-border p-1.5" dir="ltr">
              {formatDateDisplay(e.expense_date)}
            </td>
            <td className="border border-fleet-border p-1.5">{e.description}</td>
            <td className="border border-fleet-border p-1.5">{e.category ? categoryLabels[e.category] : t("not_set_yet")}</td>
            <td className="border border-fleet-border p-1.5">{paymentLabels[e.payment_method]}</td>
            <td className="border border-fleet-border p-1.5">{formatCurrency(e.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>

    {lightboxUrl && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print:hidden"
        onClick={() => setLightboxUrl(null)}
      >
        <button
          type="button"
          onClick={() => setLightboxUrl(null)}
          aria-label={t("close_word")}
          className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-fleet-navy"
        >
          <X size={18} />
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
