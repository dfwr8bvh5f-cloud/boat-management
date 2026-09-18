"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import {
  createMysSupplierCommission,
  createMysSupplierUploadUrl,
  updateMysSupplierCommission,
  approveMysSupplierCommission,
  addMysSupplierCommissionPayment,
  deleteMysSupplierCommission,
  removeMysSupplierCommissionAttachment,
} from "@/lib/actions/mys-commissions";
import { createTechnician } from "@/lib/actions/technicians";
import { AttachmentGroup } from "@/components/attachment-group";
import { ConfirmPopup } from "@/components/confirm-popup";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { FileChip } from "@/components/file-chip";
import { UploadButton } from "@/components/upload-button";
import { compressImageToLimit, HeicUnsupportedError } from "@/lib/image-compress";
import { useFileDrop, useMultiFileDrop } from "@/lib/use-file-drop";
import { createClient } from "@/lib/supabase/client";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/upload";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { formatCurrency, round2 } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import { getPaymentLabels, PAYMENT_METHODS } from "@/lib/labels";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysCommissionPayment, MysSupplierCommissionStatus, PaymentMethod } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

type Attachment = { id: string; url: string; path: string };
type Commission = {
  id: string;
  supplier_name: string;
  invoice_date: string | null;
  invoice_amount: number;
  commission_percent: number;
  commission_amount: number;
  vat_percent: number | null;
  vat_amount: number;
  total_amount: number;
  status: MysSupplierCommissionStatus;
  paid_date: string | null;
  notes: string | null;
  attachments: Attachment[];
  commission_invoice_path: string | null;
  commission_invoice_url: string | null;
  // What's actually still owed (total_amount minus everything recorded via
  // addMysSupplierCommissionPayment) - and that history itself, for the
  // "paid so far" caption. See 0101_mys_commission_payments.sql.
  remainingAmount: number;
  paidSoFar: number;
  payments: MysCommissionPayment[];
};

const STATUS_BADGE_CLASS: Record<MysSupplierCommissionStatus, string> = {
  draft: "bg-fleet-paper text-fleet-ink",
  unpaid: "bg-fleet-brass/15 text-fleet-brass",
  paid: "bg-fleet-moss/15 text-fleet-moss-text",
};

export function MysSupplierCommissionsManager({
  commissions,
  supplierNames,
  locale,
}: {
  commissions: Commission[];
  supplierNames: string[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const router = useRouter();
  const statusLabels: Record<MysSupplierCommissionStatus, string> = {
    draft: t("mys_commission_status_draft"),
    unpaid: t("mys_commission_status_unpaid"),
    paid: t("mys_commission_status_paid"),
  };
  const paymentLabels = getPaymentLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Commission | null>(null);

  const [supplierName, setSupplierName] = useState("");
  // Starts empty rather than defaulting to today - so the first invoice
  // file's scanned date (onInvoiceFile) can actually fill it in, instead of
  // that auto-fill being blocked by an already-non-empty field.
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceAmountValue, setInvoiceAmountValue] = useState("");
  const [pricingMode, setPricingMode] = useState<"percent" | "amount">("percent");
  const [commissionPercentValue, setCommissionPercentValue] = useState("");
  const [commissionAmountValue, setCommissionAmountValue] = useState("");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatPercentValue, setVatPercentValue] = useState("24");
  const [notesValue, setNotesValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showAddSupplierForm, setShowAddSupplierForm] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [addSupplierError, setAddSupplierError] = useState<string | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);

  // New files staged for this save (existing attachments, when editing, are
  // shown separately below and removed individually via their own button -
  // this list is only what's newly uploaded in the current form session).
  // `amount` is what /api/scan-receipt read off that specific invoice file
  // (null if nothing was recognized) - each successfully scanned file adds
  // its own amount onto invoiceAmountValue automatically (see onInvoiceFile
  // below), so uploading several invoices sums to the combined total
  // without her having to add them up by hand; removing a file subtracts
  // its amount back out. The total itself stays a normal editable number
  // input throughout, since a scan can misread a figure.
  const [newFiles, setNewFiles] = useState<{ path: string; name: string; amount: number | null }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // When editing an existing commission, invoiceAmountValue starts out as
  // its already-saved invoice_amount (startEdit) - not empty like the
  // create form. The very first newly-attached file in that edit session
  // replaces that stale figure instead of stacking its scanned amount on
  // top of it (which read as a confusing, wrong total). Every file after
  // that sums normally, same as the create form. A ref (not state) because
  // dropping several files at once awaits onInvoiceFile in a loop from a
  // single render, so a state read would stay stale across that whole loop.
  const editBaseReplacedRef = useRef(false);

  // The invoice she herself issues to the supplier for this commission -
  // separate from the supplier's own invoice(s) above (newFiles). Was only
  // editable from the commission row on /mys/debts until now; mirrors that
  // same field/upload logic (see mys-debts-manager.tsx's editCommInvoice*
  // state) so it's available right from creation too.
  const [commInvoicePath, setCommInvoicePath] = useState<string | null>(null);
  const [commInvoiceUrl, setCommInvoiceUrl] = useState<string | null>(null);
  const [commInvoiceName, setCommInvoiceName] = useState<string | null>(null);
  const [commInvoiceUploading, setCommInvoiceUploading] = useState(false);
  const [commInvoiceUploadError, setCommInvoiceUploadError] = useState<string | null>(null);
  const commInvoiceRef = useRef<HTMLInputElement>(null);

  const invoiceAmountNum = Number(invoiceAmountValue) || 0;
  // Live preview only - the real commission_percent/commission_amount/
  // vat_amount/total_amount stored on save are always recomputed
  // server-side from these same inputs, never trusted from here (see
  // computeCommissionFields, src/lib/actions/mys-commissions.ts).
  const previewCommissionAmount = useMemo(() => {
    if (pricingMode === "amount") return Number(commissionAmountValue) || 0;
    return round2(invoiceAmountNum * ((Number(commissionPercentValue) || 0) / 100));
  }, [pricingMode, invoiceAmountNum, commissionPercentValue, commissionAmountValue]);
  const previewCommissionPercent = useMemo(() => {
    if (pricingMode === "percent") return Number(commissionPercentValue) || 0;
    return invoiceAmountNum > 0 ? round2(((Number(commissionAmountValue) || 0) / invoiceAmountNum) * 100) : 0;
  }, [pricingMode, invoiceAmountNum, commissionPercentValue, commissionAmountValue]);
  const previewVatAmount = useMemo(
    () => (vatEnabled ? round2(previewCommissionAmount * ((Number(vatPercentValue) || 0) / 100)) : 0),
    [vatEnabled, previewCommissionAmount, vatPercentValue]
  );
  const previewTotal = round2(previewCommissionAmount + previewVatAmount);

  const resetForm = () => {
    setSupplierName("");
    setInvoiceDate("");
    setInvoiceAmountValue("");
    setPricingMode("percent");
    setCommissionPercentValue("");
    setCommissionAmountValue("");
    setVatEnabled(false);
    setVatPercentValue("24");
    setNotesValue("");
    setNewFiles([]);
    setUploadError(null);
    setSaveError(null);
    setCommInvoicePath(null);
    setCommInvoiceUrl(null);
    setCommInvoiceName(null);
    setCommInvoiceUploadError(null);
  };
  const startNew = () => {
    setEditing(null);
    resetForm();
    setShowForm(true);
  };
  const startEdit = (c: Commission) => {
    setEditing(c);
    editBaseReplacedRef.current = false;
    setSupplierName(c.supplier_name);
    setInvoiceDate(c.invoice_date ?? "");
    setInvoiceAmountValue(String(c.invoice_amount));
    setPricingMode("percent");
    setCommissionPercentValue(String(c.commission_percent));
    setCommissionAmountValue(String(c.commission_amount));
    setVatEnabled(c.vat_percent != null);
    setVatPercentValue(c.vat_percent != null ? String(c.vat_percent) : "24");
    setNotesValue(c.notes ?? "");
    setNewFiles([]);
    setUploadError(null);
    setSaveError(null);
    setCommInvoicePath(c.commission_invoice_path);
    setCommInvoiceUrl(c.commission_invoice_url);
    setCommInvoiceName(c.commission_invoice_path ? t("mys_commission_invoice_label") : null);
    setCommInvoiceUploadError(null);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setSaveError(null);
  };

  const onInvoiceFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    let toUpload: File;
    try {
      toUpload = file.type.startsWith("image/") ? await compressImageToLimit(file, MAX_UPLOAD_FILE_BYTES) : file;
    } catch (e) {
      setUploadError(e instanceof HeicUnsupportedError ? t("heic_not_supported") : e instanceof Error ? e.message : String(e));
      return;
    }
    if (toUpload.size > MAX_UPLOAD_FILE_BYTES) {
      setUploadError(t("doc_file_too_large"));
      return;
    }
    setUploading(true);
    try {
      const { path, token } = await createMysSupplierUploadUrl(toUpload.name);
      const supabase = createClient();
      const { error } = await supabase.storage.from("receipts").uploadToSignedUrl(path, token, toUpload);
      if (error) throw error;

      // AI-scans this one invoice for its own amount/date (same route the
      // expense receipt form uses) - best-effort: a failed/unrecognized scan
      // still keeps the uploaded file, just with no auto-added amount for
      // it, and she can always fix the total by hand either way.
      //
      // The commission is calculated on the invoice amount BEFORE VAT (her
      // own VAT field then adds VAT back on top of the commission itself,
      // not the invoice) - so this prefers the scan's amount_before_vat
      // when the document clearly separates VAT as its own line, and only
      // falls back to the VAT-inclusive total when it doesn't.
      let scannedAmount: number | null = null;
      try {
        const body = new FormData();
        body.set("file", toUpload);
        const res = await fetch("/api/scan-receipt", { method: "POST", body });
        const data = await res.json();
        if (res.ok && !data.error) {
          if (typeof data.result?.amount_before_vat === "number") scannedAmount = data.result.amount_before_vat;
          else if (typeof data.result?.amount === "number") scannedAmount = data.result.amount;
          if (data.result?.expense_date) setInvoiceDate((prev) => prev || data.result.expense_date);
        }
      } catch {
        // Scanning is a convenience, not a requirement - ignore and leave this file's amount null.
      }
      if (scannedAmount != null) {
        if (editing && !editBaseReplacedRef.current) {
          editBaseReplacedRef.current = true;
          setInvoiceAmountValue(String(scannedAmount));
        } else {
          setInvoiceAmountValue((prev) => String(round2((Number(prev) || 0) + scannedAmount!)));
        }
      }
      setNewFiles((prev) => [...prev, { path, name: toUpload.name, amount: scannedAmount }]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t("upload_failed"));
    } finally {
      setUploading(false);
    }
  };
  // Dropping several invoice files onto the zone at once (e.g. dragged
  // together from Finder) used to only pick up the first one - useFileDrop
  // is a single-file hook by design (every other drop zone in the app is
  // genuinely single-file), so this one uses the multi-file variant and
  // processes every dropped file the same way the native multi-select file
  // picker below already does.
  const { dragging: fileDragging, dropHandlers: fileDropHandlers } = useMultiFileDrop(async (files) => {
    for (const file of files) await onInvoiceFile(file);
  });
  const removeNewFile = (index: number) =>
    setNewFiles((prev) => {
      const removed = prev[index];
      const remaining = prev.filter((_, i) => i !== index);
      if (editing && remaining.length === 0) {
        // Undoing the last newly-attached file in an edit session - restore
        // exactly what was saved on this commission before she started
        // attaching files this time (see the "replace, not stack" comment
        // above editBaseReplacedRef), rather than just subtracting and
        // risking a wrong leftover number.
        editBaseReplacedRef.current = false;
        setInvoiceAmountValue(String(editing.invoice_amount));
      } else if (removed?.amount != null) {
        setInvoiceAmountValue((amt) => String(round2((Number(amt) || 0) - removed.amount!)));
      }
      return remaining;
    });

  const onCommInvoiceFile = async (file: File | undefined) => {
    if (!file) return;
    setCommInvoiceUploadError(null);
    let toUpload: File;
    try {
      toUpload = file.type.startsWith("image/") ? await compressImageToLimit(file, MAX_UPLOAD_FILE_BYTES) : file;
    } catch (e) {
      setCommInvoiceUploadError(e instanceof HeicUnsupportedError ? t("heic_not_supported") : e instanceof Error ? e.message : String(e));
      return;
    }
    if (toUpload.size > MAX_UPLOAD_FILE_BYTES) {
      setCommInvoiceUploadError(t("doc_file_too_large"));
      return;
    }
    setCommInvoiceUploading(true);
    try {
      const { path, token } = await createMysSupplierUploadUrl(toUpload.name);
      const supabase = createClient();
      const { error } = await supabase.storage.from("receipts").uploadToSignedUrl(path, token, toUpload);
      if (error) throw error;
      setCommInvoicePath(path);
      setCommInvoiceUrl(null);
      setCommInvoiceName(toUpload.name);
    } catch (e) {
      setCommInvoiceUploadError(e instanceof Error ? e.message : t("upload_failed"));
    } finally {
      setCommInvoiceUploading(false);
    }
  };
  const clearCommInvoiceFile = () => {
    setCommInvoicePath(null);
    setCommInvoiceUrl(null);
    setCommInvoiceName(null);
  };
  const { dragging: commInvoiceDragging, dropHandlers: commInvoiceDropHandlers } = useFileDrop(onCommInvoiceFile);

  const doSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("supplier_name", supplierName);
      fd.set("invoice_date", invoiceDate);
      fd.set("invoice_amount", invoiceAmountValue);
      fd.set("pricing_mode", pricingMode);
      fd.set("commission_percent", pricingMode === "percent" ? commissionPercentValue : String(previewCommissionPercent));
      fd.set("commission_amount", pricingMode === "amount" ? commissionAmountValue : String(previewCommissionAmount));
      fd.set("vat_percent", vatEnabled ? vatPercentValue : "");
      fd.set("notes", notesValue);
      fd.set("commission_invoice_path", commInvoicePath ?? "");
      newFiles.forEach((f) => fd.append("attachment_paths", f.path));

      if (editing) {
        const result = await updateMysSupplierCommission(editing.id, fd);
        if (result?.error) {
          setSaveError(result.error);
          return;
        }
      } else {
        await createMysSupplierCommission(fd);
      }
      closeForm();
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const doAddSupplier = async (formData: FormData) => {
    setAddSupplierError(null);
    setSavingSupplier(true);
    try {
      await createTechnician(formData);
      setShowAddSupplierForm(false);
      setNewSupplierName("");
      // createTechnician only revalidates /technicians (it's shared by every
      // page that uses this directory) - refresh here too so the new name
      // shows up in this page's own supplierNames list right away.
      router.refresh();
    } catch (e) {
      setAddSupplierError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSavingSupplier(false);
    }
  };

  const [approveError, setApproveError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const doApprove = async (commissionId: string) => {
    setApproveError(null);
    setApprovingId(commissionId);
    try {
      const result = await approveMysSupplierCommission(commissionId);
      if (result?.error) {
        setApproveError(result.error);
        return;
      }
      router.refresh();
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setApprovingId(null);
    }
  };

  // --- Record a (possibly partial) payment against a commission (see
  // addMysSupplierCommissionPayment, src/lib/actions/mys-commissions.ts) -
  // same small form mys-debts-manager.tsx's own "Record payment" button
  // uses, rather than a blind one-click today+no-method stamp. ---
  const [payingCommissionId, setPayingCommissionId] = useState<string | null>(null);
  const [commPayAmount, setCommPayAmount] = useState("");
  const [commPayDate, setCommPayDate] = useState(todayLocalISO());
  const [commPayMethod, setCommPayMethod] = useState<PaymentMethod | "">("");
  const [commPaySaving, setCommPaySaving] = useState(false);
  const [commPayError, setCommPayError] = useState<string | null>(null);

  const startCommissionPayment = (id: string) => {
    setPayingCommissionId(id);
    setCommPayAmount(String(commissions.find((c) => c.id === id)?.remainingAmount ?? ""));
    setCommPayDate(todayLocalISO());
    setCommPayMethod("");
    setCommPayError(null);
  };
  const closeCommissionPayment = () => {
    setPayingCommissionId(null);
    setCommPayError(null);
  };
  const doSaveCommissionPayment = async () => {
    if (!payingCommissionId) return;
    setCommPayError(null);
    setCommPaySaving(true);
    try {
      const fd = new FormData();
      fd.set("amount", commPayAmount);
      fd.set("paid_date", commPayDate);
      fd.set("payment_method", commPayMethod);
      const result = await addMysSupplierCommissionPayment(payingCommissionId, fd);
      if (result?.error) {
        setCommPayError(result.error);
        return;
      }
      closeCommissionPayment();
      router.refresh();
    } catch (e) {
      setCommPayError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setCommPaySaving(false);
    }
  };

  const [pendingRemoveAttachment, setPendingRemoveAttachment] = useState<{ id: string; path: string } | null>(null);
  const doRemoveAttachment = async () => {
    if (!pendingRemoveAttachment) return;
    await removeMysSupplierCommissionAttachment(pendingRemoveAttachment.id, pendingRemoveAttachment.path);
    setPendingRemoveAttachment(null);
    router.refresh();
  };

  const total = commissions.reduce((s, c) => s + (c.status === "paid" ? 0 : c.remainingAmount), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mys_commissions_title")}</h1>
        <button
          onClick={() => (showForm ? closeForm() : startNew())}
          className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
        >
          {showForm ? (
            <span className="inline-flex items-center gap-1">
              <X size={14} /> {t("close_word")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Plus size={14} /> {t("mys_add_commission")}
            </span>
          )}
        </button>
      </div>

      {showForm && (
        <div className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_supplier_invoice_file_label")}</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                for (const file of files) await onInvoiceFile(file);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <UploadButton
              onClick={() => fileRef.current?.click()}
              dropHandlers={fileDropHandlers}
              dragging={fileDragging}
              busy={uploading}
              done={newFiles.length > 0 || Boolean(editing?.attachments.length)}
              icon={<Pin size={16} />}
              label={t("mys_upload_supplier_invoice_cta")}
              busyLabel={t("uploading_word")}
              doneLabel={t("add_another_file")}
            />
            {uploadError && <p className="text-xs text-fleet-coral-text">{uploadError}</p>}
            {editing && editing.attachments.length > 0 && (
              <div className="flex flex-col gap-1">
                {editing.attachments.map((a) => (
                  <FileChip
                    key={a.id}
                    icon={<Pin size={14} className="shrink-0" />}
                    name={t("mys_supplier_invoice_file_label")}
                    href={a.url}
                    onRemove={() => setPendingRemoveAttachment({ id: a.id, path: a.path })}
                    removeLabel={t("remove_word")}
                  />
                ))}
              </div>
            )}
            {newFiles.map((f, i) => (
              <FileChip
                key={f.path}
                icon={<Pin size={14} className="shrink-0" />}
                name={f.amount != null ? `${f.name} (${formatCurrency(f.amount)})` : f.name}
                onRemove={() => removeNewFile(i)}
                removeLabel={t("remove_word")}
              />
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_supplier_label")} *</label>
            <div className="flex gap-2">
              <CustomSelect
                value={supplierName}
                onChange={setSupplierName}
                options={supplierNames.map((name) => ({ value: name, label: name }))}
                placeholder={t("mys_supplier_select_placeholder")}
                emphasizeEmpty
                searchable
                searchPlaceholder={t("mys_client_search_placeholder")}
                className={INPUT_CLASS}
              />
              <button
                type="button"
                onClick={() => setShowAddSupplierForm((s) => !s)}
                className={`shrink-0 ${SECONDARY_BUTTON_CLASS}`}
              >
                <Plus size={14} />
              </button>
            </div>
            {showAddSupplierForm && (
              <form action={doAddSupplier} className="flex gap-2">
                <input name="name" required value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} className={INPUT_CLASS} />
                <button type="submit" disabled={savingSupplier} className={`shrink-0 ${PRIMARY_BUTTON_CLASS}`}>
                  {savingSupplier ? t("saving_word") : t("save_word")}
                </button>
              </form>
            )}
            {addSupplierError && <p className="text-xs text-fleet-coral-text">{addSupplierError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("mys_supplier_invoice_amount_label")} *</label>
              <input
                type="number"
                step="0.01"
                required
                value={invoiceAmountValue}
                onChange={(e) => setInvoiceAmountValue(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("mys_supplier_invoice_date_label")}</label>
              <DateInput value={invoiceDate} onChange={setInvoiceDate} locale={locale} className={INPUT_CLASS} allowClear />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_commission_label")}</label>
            <div className="flex gap-1 rounded-full bg-fleet-paper p-1 text-2xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setCommissionPercentValue(String(previewCommissionPercent));
                  setPricingMode("percent");
                }}
                className={`flex-1 rounded-full px-2 py-1 ${pricingMode === "percent" ? "bg-white text-fleet-navy shadow-sm" : "text-fleet-ink"}`}
              >
                {t("mys_pricing_mode_percent")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCommissionAmountValue(String(previewCommissionAmount));
                  setPricingMode("amount");
                }}
                className={`flex-1 rounded-full px-2 py-1 ${pricingMode === "amount" ? "bg-white text-fleet-navy shadow-sm" : "text-fleet-ink"}`}
              >
                {t("mys_pricing_mode_price")}
              </button>
            </div>
            {pricingMode === "percent" ? (
              <>
                <input
                  type="number"
                  step="0.1"
                  value={commissionPercentValue}
                  onChange={(e) => setCommissionPercentValue(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="%"
                  className={INPUT_CLASS}
                />
                <div className="text-xs font-bold text-fleet-navy">
                  {t("mys_commission_amount_label")}: {formatCurrency(previewCommissionAmount)}
                </div>
              </>
            ) : (
              <>
                <input
                  type="number"
                  step="0.01"
                  value={commissionAmountValue}
                  onChange={(e) => setCommissionAmountValue(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={INPUT_CLASS}
                />
                <div className="text-xs font-bold text-fleet-navy">
                  {t("mys_commission_percent_preview_label")}: {previewCommissionPercent}%
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_vat_amount_label")}</label>
            {vatEnabled ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={vatPercentValue}
                  onChange={(e) => setVatPercentValue(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => setVatEnabled(false)}
                  title={t("mys_remove_vat_cta")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fleet-ink hover:text-fleet-coral-text"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setVatEnabled(true)}
                className="inline-flex w-fit items-center gap-1 rounded-full border border-fleet-border px-2 py-1 text-2xs font-bold text-fleet-ink hover:bg-fleet-paper"
              >
                <Plus size={11} /> {t("mys_add_vat_cta")}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1 rounded-lg bg-fleet-paper p-3 text-xs">
            <div className="flex justify-between gap-6">
              <span className="text-fleet-ink">{t("mys_commission_amount_label")}</span>
              <span>{formatCurrency(previewCommissionAmount)}</span>
            </div>
            {vatEnabled && (
              <div className="flex justify-between gap-6">
                <span className="text-fleet-ink">{t("mys_vat_amount_label")}</span>
                <span>{formatCurrency(previewVatAmount)}</span>
              </div>
            )}
            <div className="flex justify-between gap-6 border-t border-fleet-border pt-1 font-bold text-fleet-navy">
              <span>{t("mys_invoice_total_label")}</span>
              <span>{formatCurrency(previewTotal)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_commission_invoice_label")}</label>
            <input
              ref={commInvoiceRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                onCommInvoiceFile(e.target.files?.[0]);
                if (commInvoiceRef.current) commInvoiceRef.current.value = "";
              }}
            />
            <UploadButton
              onClick={() => commInvoiceRef.current?.click()}
              dropHandlers={commInvoiceDropHandlers}
              dragging={commInvoiceDragging}
              busy={commInvoiceUploading}
              done={commInvoicePath != null}
              icon={<FileText size={16} />}
              label={t("mys_upload_commission_invoice_cta")}
              busyLabel={t("uploading_word")}
              doneLabel={t("add_another_file")}
            />
            {commInvoiceUploadError && <p className="text-xs text-fleet-coral-text">{commInvoiceUploadError}</p>}
            {commInvoicePath && (
              <FileChip
                icon={<FileText size={14} className="shrink-0" />}
                name={commInvoiceName ?? t("mys_commission_invoice_label")}
                href={commInvoiceUrl ?? undefined}
                onRemove={clearCommInvoiceFile}
                removeLabel={t("remove_word")}
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
            <textarea name="notes" rows={2} value={notesValue} onChange={(e) => setNotesValue(e.target.value)} className={INPUT_CLASS} />
          </div>

          {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button type="button" disabled={saving || uploading} onClick={doSave} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
              {saving ? t("saving_word") : t("save_word")}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-fleet-border bg-white p-4 text-sm font-bold text-fleet-navy">
        {t("mys_commissions_open_total")}: {formatCurrency(total)}
      </div>

      {approveError && (
        <div className="flex items-center gap-2 rounded-lg border border-fleet-coral bg-fleet-coral/10 px-3 py-2 text-xs text-fleet-coral-text">
          <span className="flex-1">{approveError}</span>
          <button type="button" onClick={() => setApproveError(null)} aria-label="dismiss" className="shrink-0 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      {commissions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_commissions")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {commissions.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-3">
              <div className="flex flex-nowrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate text-sm">
                    {c.supplier_name}
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${STATUS_BADGE_CLASS[c.status]}`}>
                      {statusLabels[c.status]}
                    </span>
                  </div>
                  <div className="truncate text-xs text-fleet-ink">
                    {c.invoice_date && <span dir="ltr">{formatDateDisplay(c.invoice_date)}</span>}
                    {c.invoice_date && " · "}
                    {t("mys_supplier_invoice_amount_label")}: {formatCurrency(c.invoice_amount)} · {c.commission_percent}%
                    {c.vat_percent != null && ` · ${t("mys_vat_amount_label")} ${c.vat_percent}%`}
                  </div>
                  {c.paidSoFar > 0 && c.status !== "paid" && (
                    <div className="truncate text-2xs font-bold text-fleet-amber-text">
                      {t("mys_invoice_paid_so_far", { amount: formatCurrency(c.paidSoFar) })}
                    </div>
                  )}
                </div>
                {c.attachments.length > 0 && (
                  <AttachmentGroup
                    compact
                    files={c.attachments.map((a) => ({ id: a.id, url: a.url }))}
                    icon={<Pin size={14} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                    label={t("mys_supplier_invoice_file_label")}
                    onOpen={(url) => window.open(url, "_blank", "noopener,noreferrer")}
                  />
                )}
                <div className="shrink-0 text-sm font-bold text-fleet-navy">
                  {formatCurrency(c.status === "paid" ? c.total_amount : c.remainingAmount)}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {c.status !== "paid" && (
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      aria-label={t("update_word")}
                      title={t("update_word")}
                      className="flex h-8 w-8 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {c.status === "draft" && (
                    <button
                      type="button"
                      disabled={approvingId === c.id}
                      onClick={() => doApprove(c.id)}
                      className="rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper disabled:opacity-60"
                    >
                      {t("mys_approve_commission_cta")}
                    </button>
                  )}
                  {c.status === "unpaid" && payingCommissionId !== c.id && (
                    <button
                      type="button"
                      onClick={() => startCommissionPayment(c.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                        c.paidSoFar > 0
                          ? "bg-fleet-amber/15 text-fleet-amber-text hover:bg-fleet-amber/25"
                          : "border border-fleet-border text-fleet-navy hover:bg-fleet-paper"
                      }`}
                    >
                      {c.paidSoFar > 0 ? t("mys_partially_paid_cta") : t("mys_mark_settled")}
                    </button>
                  )}
                  <form action={deleteMysSupplierCommission.bind(null, c.id)}>
                    <ConfirmSubmitButton
                      locale={locale}
                      confirmMessage={t("mys_delete_commission_confirm")}
                      ariaLabel={t("delete_word")}
                      className="flex h-8 w-8 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                    >
                      <Trash2 size={14} />
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
              {payingCommissionId === c.id && (
                <div className="flex flex-col gap-2 rounded-lg bg-fleet-paper p-2.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("amount")}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={commPayAmount}
                        onChange={(e) => setCommPayAmount(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("payment_method")}</label>
                      <CustomSelect
                        value={commPayMethod}
                        onChange={(v) => setCommPayMethod(v as PaymentMethod | "")}
                        options={[{ value: "", label: t("not_set_yet") }, ...PAYMENT_METHODS.map((k) => ({ value: k, label: paymentLabels[k] }))]}
                        placeholder={t("not_set_yet")}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("date")}</label>
                      <DateInput value={commPayDate} onChange={setCommPayDate} locale={locale} className={INPUT_CLASS} allowClear />
                    </div>
                  </div>
                  {commPayError && <p className="text-xs text-fleet-coral-text">{commPayError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={closeCommissionPayment} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                      {t("close_word")}
                    </button>
                    <button type="button" disabled={commPaySaving} onClick={doSaveCommissionPayment} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
                      {commPaySaving ? t("saving_word") : t("mys_record_payment_cta")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingRemoveAttachment && (
        <ConfirmPopup
          message={t("mys_remove_attachment_confirm")}
          onConfirm={doRemoveAttachment}
          onCancel={() => setPendingRemoveAttachment(null)}
          locale={locale}
        />
      )}
    </div>
  );
}
