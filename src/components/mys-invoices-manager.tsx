"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Eye, FileText, Pencil, Plus, ReceiptEuro, Upload, X } from "lucide-react";
import {
  createMysInvoice,
  createMysInvoiceUploadUrl,
  updateMysInvoice,
  updateMysInvoiceLine,
  markMysInvoiceSent,
  addMysInvoicePayment,
  voidMysInvoice,
} from "@/lib/actions/mys";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { FileChip } from "@/components/file-chip";
import { UploadButton } from "@/components/upload-button";
import { compressImageToLimit, HeicUnsupportedError } from "@/lib/image-compress";
import { useFileDrop } from "@/lib/use-file-drop";
import { createClient } from "@/lib/supabase/client";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/upload";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { formatCurrency, round2 } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysInvoice, MysInvoiceLine, MysInvoicePayment, MysInvoiceStatus } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

const STATUS_CLASSES: Record<MysInvoiceStatus, string> = {
  draft: "bg-fleet-paper text-fleet-ink",
  sent: "bg-fleet-brass/15 text-fleet-brass",
  paid: "bg-fleet-moss/15 text-fleet-moss-text",
  void: "bg-fleet-coral/15 text-fleet-coral-text",
};

type InvoiceWithExtras = MysInvoice & { lines: MysInvoiceLine[]; payments: MysInvoicePayment[]; invoiceUrl: string | null };

export function MysInvoicesManager({
  invoices,
  boats,
  locale,
}: {
  invoices: InvoiceWithExtras[];
  boats: { id: string; name: string }[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const statusLabels: Record<MysInvoiceStatus, string> = {
    draft: t("mys_invoice_status_draft"),
    sent: t("mys_invoice_status_sent"),
    paid: t("mys_invoice_status_paid"),
    void: t("mys_invoice_status_void"),
  };

  const [showForm, setShowForm] = useState(false);
  const [boatId, setBoatId] = useState("");
  const [clientName, setClientName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const closeForm = () => {
    setShowForm(false);
    setBoatId("");
    setClientName("");
    setDueDate("");
    setSaveError(null);
  };

  const doSave = async (formData: FormData) => {
    setSaveError(null);
    setSaving(true);
    try {
      await createMysInvoice(formData);
      closeForm();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  // --- Edit an existing invoice (description/client/due-date/file always,
  // amount/vat only for a lines-less, manually-typed invoice - see
  // updateMysInvoice, src/lib/actions/mys.ts) ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editClientName, setEditClientName] = useState("");
  const [editClientEmail, setEditClientEmail] = useState("");
  const [editClientCompanyDetails, setEditClientCompanyDetails] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editVatAmount, setEditVatAmount] = useState("");
  const [editLines, setEditLines] = useState<{ id: string; description: string; amount: string; vat_percent: string }[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const [editInvoicePath, setEditInvoicePath] = useState("");
  const [editInvoiceName, setEditInvoiceName] = useState<string | null>(null);
  const [editInvoiceExistingUrl, setEditInvoiceExistingUrl] = useState<string | null>(null);
  const [editFileUploading, setEditFileUploading] = useState(false);
  const [editFileError, setEditFileError] = useState<string | null>(null);

  const startEdit = (inv: InvoiceWithExtras) => {
    setEditingId(inv.id);
    setEditDescription(inv.description);
    setEditClientName(inv.client_name);
    setEditClientEmail(inv.client_email ?? "");
    setEditClientCompanyDetails(inv.client_company_details ?? "");
    setEditDueDate(inv.due_date ?? "");
    setEditAmount(String(inv.amount));
    setEditVatAmount(String(inv.vat_amount));
    setEditLines(inv.lines.map((l) => ({ id: l.id, description: l.description, amount: String(l.amount), vat_percent: String(l.vat_percent) })));
    setEditInvoicePath(inv.invoice_path ?? "");
    setEditInvoiceName(null);
    setEditInvoiceExistingUrl(inv.invoiceUrl);
    setEditError(null);
    setEditFileError(null);
  };
  const setEditLineField = (id: string, field: "description" | "amount" | "vat_percent", value: string) =>
    setEditLines((ls) => ls.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  const closeEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const onEditFile = async (file: File | undefined) => {
    if (!file) return;
    setEditFileError(null);
    let toUpload: File;
    try {
      toUpload = file.type.startsWith("image/") ? await compressImageToLimit(file, MAX_UPLOAD_FILE_BYTES) : file;
    } catch (e) {
      setEditFileError(e instanceof HeicUnsupportedError ? t("heic_not_supported") : e instanceof Error ? e.message : String(e));
      return;
    }
    if (toUpload.size > MAX_UPLOAD_FILE_BYTES) {
      setEditFileError(t("doc_file_too_large"));
      return;
    }
    setEditFileUploading(true);
    try {
      const { path, token } = await createMysInvoiceUploadUrl(toUpload.name);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("receipts").uploadToSignedUrl(path, token, toUpload);
      if (uploadError) throw uploadError;
      setEditInvoicePath(path);
      setEditInvoiceName(toUpload.name);
      setEditInvoiceExistingUrl(null);
    } catch (e) {
      setEditFileError(e instanceof Error ? e.message : t("upload_failed"));
    } finally {
      setEditFileUploading(false);
    }
  };
  const { dragging: editFileDragging, dropHandlers: editFileDropHandlers } = useFileDrop(onEditFile);
  const clearEditFile = () => {
    if (editFileRef.current) editFileRef.current.value = "";
    setEditInvoicePath("");
    setEditInvoiceName(null);
    setEditInvoiceExistingUrl(null);
  };

  const doSaveEdit = async (invoiceId: string) => {
    setEditError(null);
    setEditSaving(true);
    try {
      await Promise.all(
        editLines.map((l) => {
          const lineFd = new FormData();
          lineFd.set("description", l.description);
          lineFd.set("amount", l.amount);
          lineFd.set("vat_percent", l.vat_percent);
          return updateMysInvoiceLine(l.id, lineFd);
        })
      );
      const fd = new FormData();
      fd.set("client_name", editClientName);
      fd.set("client_email", editClientEmail);
      fd.set("client_company_details", editClientCompanyDetails);
      fd.set("description", editDescription);
      fd.set("due_date", editDueDate);
      fd.set("amount", editAmount);
      fd.set("vat_amount", editVatAmount);
      fd.set("invoice_path", editInvoicePath);
      await updateMysInvoice(invoiceId, fd);
      closeEdit();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setEditSaving(false);
    }
  };

  // --- Record a (possibly partial) payment against a 'sent' invoice ---
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayLocalISO());
  const [payNotes, setPayNotes] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const startPayment = (inv: InvoiceWithExtras, remaining: number) => {
    setPayingId(inv.id);
    setPayAmount(String(remaining));
    setPayDate(todayLocalISO());
    setPayNotes("");
    setPayError(null);
  };
  const closePayment = () => {
    setPayingId(null);
    setPayError(null);
  };
  const doSavePayment = async (invoiceId: string) => {
    setPayError(null);
    setPaySaving(true);
    try {
      const fd = new FormData();
      fd.set("amount", payAmount);
      fd.set("paid_date", payDate);
      fd.set("notes", payNotes);
      await addMysInvoicePayment(invoiceId, fd);
      closePayment();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setPaySaving(false);
    }
  };

  const [voidError, setVoidError] = useState<string | null>(null);
  // A plain click+confirm (not a <form>-submitted ConfirmSubmitButton) so a
  // thrown error - e.g. voidMysInvoice refusing an invoice that already has
  // payments recorded - can be caught and shown in-line instead of hitting
  // the app's generic error boundary.
  const [pendingVoidId, setPendingVoidId] = useState<string | null>(null);
  const doVoid = async (invoiceId: string) => {
    setVoidError(null);
    try {
      await voidMysInvoice(invoiceId);
    } catch (e) {
      setVoidError(e instanceof Error ? e.message : t("save_failed"));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mys_invoices_title")}</h1>
        <button
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
          className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
        >
          {showForm ? (
            <span className="inline-flex items-center gap-1">
              <X size={14} /> {t("close_word")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Plus size={14} /> {t("mys_add_invoice")}
            </span>
          )}
        </button>
      </div>

      {showForm && (
        <form action={doSave} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_invoice_boat")}</label>
            <CustomSelect
              name="boat_id"
              value={boatId}
              onChange={(v) => {
                setBoatId(v);
                const boat = boats.find((b) => b.id === v);
                if (boat) setClientName(boat.name);
              }}
              options={[{ value: "", label: t("mys_invoice_free_client") }, ...boats.map((b) => ({ value: b.id, label: b.name }))]}
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_ad_hoc_client_name")} *</label>
            <input name="client_name" required value={clientName} onChange={(e) => setClientName(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
            <input name="client_email" type="email" className={INPUT_CLASS} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("description")} *</label>
            <input name="description" required className={INPUT_CLASS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("amount")} *</label>
              <input name="amount" type="number" step="0.01" required onWheel={(e) => e.currentTarget.blur()} className={INPUT_CLASS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("mys_invoice_due_date")}</label>
              <DateInput name="due_date" value={dueDate} onChange={setDueDate} locale={locale} className={INPUT_CLASS} allowClear />
            </div>
          </div>
          {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button type="submit" disabled={saving} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
              {saving ? t("saving_word") : t("mys_add_invoice")}
            </button>
          </div>
        </form>
      )}

      {voidError && (
        <div className="flex items-center gap-2 rounded-lg border border-fleet-coral bg-fleet-coral/10 px-3 py-2 text-xs text-fleet-coral-text">
          <span className="flex-1">{voidError}</span>
          <button type="button" onClick={() => setVoidError(null)} aria-label="dismiss" className="shrink-0 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      {invoices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_invoices")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {invoices.map((inv) => {
            const total = round2(inv.amount + inv.vat_amount);
            const paidSoFar = round2(inv.payments.reduce((s, p) => s + p.amount, 0));
            const remaining = round2(Math.max(0, total - paidSoFar));
            const expanded = expandedIds.has(inv.id);
            const hasExtra = inv.lines.length > 0 || inv.payments.length > 0;
            const isEditing = editingId === inv.id;
            const isPaying = payingId === inv.id;
            return (
            <div key={inv.id} className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-3">
              {isEditing ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_ad_hoc_client_name")}</label>
                    <input value={editClientName} onChange={(e) => setEditClientName(e.target.value)} className={INPUT_CLASS} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
                    <input value={editClientEmail} onChange={(e) => setEditClientEmail(e.target.value)} type="email" className={INPUT_CLASS} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_client_company_details_label")}</label>
                    <textarea
                      value={editClientCompanyDetails}
                      onChange={(e) => setEditClientCompanyDetails(e.target.value)}
                      placeholder={t("mys_client_company_details_placeholder")}
                      rows={3}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("description")}</label>
                    <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className={INPUT_CLASS} />
                  </div>
                  {inv.lines.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_edit_lines_label")}</label>
                      {editLines.map((l) => (
                        <div key={l.id} className="grid grid-cols-[1fr_5.5rem_4.5rem] items-center gap-1.5">
                          <input
                            value={l.description}
                            onChange={(e) => setEditLineField(l.id, "description", e.target.value)}
                            className={INPUT_CLASS}
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={l.amount}
                            onChange={(e) => setEditLineField(l.id, "amount", e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={INPUT_CLASS}
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.1"
                              value={l.vat_percent}
                              onChange={(e) => setEditLineField(l.id, "vat_percent", e.target.value)}
                              onWheel={(e) => e.currentTarget.blur()}
                              className={INPUT_CLASS}
                            />
                            <span className="shrink-0 text-2xs text-fleet-ink">%</span>
                          </div>
                        </div>
                      ))}
                      <div className="text-end text-2xs text-fleet-ink">
                        {t("mys_invoice_subtotal_label")}: {formatCurrency(round2(editLines.reduce((s, l) => s + (Number(l.amount) || 0), 0)))} ·{" "}
                        {t("mys_vat_amount_label")}:{" "}
                        {formatCurrency(
                          round2(editLines.reduce((s, l) => s + round2((Number(l.amount) || 0) * ((Number(l.vat_percent) || 0) / 100)), 0))
                        )}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {inv.lines.length === 0 ? (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-fleet-ink">{t("amount")}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-fleet-ink">{t("mys_vat_amount_label")}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editVatAmount}
                            onChange={(e) => setEditVatAmount(e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={INPUT_CLASS}
                          />
                        </div>
                      </>
                    ) : null}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_due_date")}</label>
                      <DateInput value={editDueDate} onChange={setEditDueDate} locale={locale} className={INPUT_CLASS} allowClear />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_upload_invoice_cta")}</label>
                    <input
                      ref={editFileRef}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => onEditFile(e.target.files?.[0])}
                    />
                    <UploadButton
                      onClick={() => editFileRef.current?.click()}
                      dropHandlers={editFileDropHandlers}
                      dragging={editFileDragging}
                      busy={editFileUploading}
                      done={Boolean(editInvoicePath)}
                      fullWidth={false}
                      icon={<FileText size={16} />}
                      label={t("mys_upload_invoice_cta")}
                      busyLabel={t("uploading_word")}
                      doneLabel={t("photo_selected")}
                    />
                    {editInvoicePath && (editInvoiceName || editInvoiceExistingUrl) && (
                      <FileChip
                        icon={<Upload size={14} className="shrink-0" />}
                        name={editInvoiceName ?? t("mys_upload_invoice_cta")}
                        href={editInvoiceExistingUrl ?? undefined}
                        onRemove={clearEditFile}
                        removeLabel={t("remove_word")}
                      />
                    )}
                    {editFileError && <p className="text-xs text-fleet-coral-text">{editFileError}</p>}
                  </div>
                  {editError && <p className="text-xs text-fleet-coral-text">{editError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={closeEdit} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                      {t("close_word")}
                    </button>
                    <button
                      type="button"
                      disabled={editSaving}
                      onClick={() => doSaveEdit(inv.id)}
                      className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
                    >
                      {editSaving ? t("saving_word") : t("save_edit")}
                    </button>
                  </div>
                </div>
              ) : (
              <div className="flex flex-nowrap items-center gap-3">
              {hasExtra && (
                <button
                  type="button"
                  onClick={() => toggleExpanded(inv.id)}
                  aria-label={t(expanded ? "mys_invoice_hide_items" : "mys_invoice_show_items")}
                  title={t(expanded ? "mys_invoice_hide_items" : "mys_invoice_show_items")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                >
                  {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  <span dir="ltr">{inv.invoice_number}</span> · {inv.client_name}
                </div>
                <div className="truncate text-xs text-fleet-ink">
                  {inv.description}
                  {" · "}
                  <span dir="ltr">{formatDateDisplay(inv.issued_date)}</span>
                  {inv.due_date && (
                    <>
                      {" · "}
                      {t("mys_invoice_due_date")}: <span dir="ltr">{formatDateDisplay(inv.due_date)}</span>
                    </>
                  )}
                </div>
                {paidSoFar > 0 && inv.status !== "paid" && (
                  <div className="truncate text-2xs font-bold text-fleet-brass">
                    {t("mys_invoice_paid_so_far", { amount: formatCurrency(paidSoFar) })}
                  </div>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-2xs font-bold ${STATUS_CLASSES[inv.status]}`}>
                {statusLabels[inv.status]}
              </span>
              <Link
                href={`/mys/invoices/${inv.id}`}
                aria-label={t("mys_view_invoice_document")}
                title={t("mys_view_invoice_document")}
                className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
              >
                <Eye size={14} />
              </Link>
              {inv.invoiceUrl && (
                <a
                  href={inv.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("mys_upload_invoice_cta")}
                  title={t("mys_upload_invoice_cta")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                >
                  <ReceiptEuro size={14} />
                </a>
              )}
              <div className="shrink-0 text-end">
                <div className="text-sm font-bold text-fleet-navy">{formatCurrency(total)}</div>
                {inv.vat_amount > 0 && (
                  <div className="text-2xs text-fleet-ink">
                    {t("mys_vat_amount_label")}: {formatCurrency(inv.vat_amount)}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => startEdit(inv)}
                aria-label={t("update_word")}
                title={t("update_word")}
                className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
              >
                <Pencil size={14} />
              </button>
              {inv.status === "draft" && (
                <form action={markMysInvoiceSent.bind(null, inv.id)}>
                  <button type="submit" className="rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper">
                    {t("mys_mark_sent")}
                  </button>
                </form>
              )}
              {inv.status === "sent" && !isPaying && (
                <button
                  type="button"
                  onClick={() => startPayment(inv, remaining)}
                  className="rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
                >
                  {t("mys_record_payment_cta")}
                </button>
              )}
              {(inv.status === "draft" || inv.status === "sent") && (
                <button
                  type="button"
                  onClick={() => setPendingVoidId(inv.id)}
                  aria-label={t("mys_void_invoice")}
                  title={t("mys_void_invoice")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                >
                  <X size={14} />
                </button>
              )}
              </div>
              )}
              {isPaying && (
                <div className="flex flex-col gap-2 rounded-lg bg-fleet-paper p-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("amount")}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("date")}</label>
                      <DateInput value={payDate} onChange={setPayDate} locale={locale} className={INPUT_CLASS} />
                    </div>
                  </div>
                  <input
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder={t("new_expense_notes")}
                    className={INPUT_CLASS}
                  />
                  {payError && <p className="text-xs text-fleet-coral-text">{payError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={closePayment} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                      {t("close_word")}
                    </button>
                    <button
                      type="button"
                      disabled={paySaving}
                      onClick={() => doSavePayment(inv.id)}
                      className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
                    >
                      {paySaving ? t("saving_word") : t("mys_record_payment_cta")}
                    </button>
                  </div>
                </div>
              )}
              {expanded && hasExtra && (
                <div className="animate-expand-in flex flex-col gap-1 border-t border-fleet-border pt-2">
                  {inv.lines.map((line) => (
                    <div key={line.id} className="flex items-center gap-3 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs">
                      <div className="min-w-0 flex-1 truncate">{line.description}</div>
                      <div className="shrink-0 text-fleet-ink">{formatCurrency(line.amount)}</div>
                      {line.vat_percent > 0 && (
                        <div className="shrink-0 text-fleet-ink">
                          {t("mys_vat_percent_label")} {line.vat_percent}% = {formatCurrency(line.vat_amount)}
                        </div>
                      )}
                    </div>
                  ))}
                  {inv.payments.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-lg bg-fleet-moss/10 px-2.5 py-1.5 text-xs">
                      <div className="min-w-0 flex-1 truncate">
                        {t("mys_payment_received_label")}
                        {p.notes ? ` · ${p.notes}` : ""}
                      </div>
                      <div className="shrink-0 text-fleet-ink" dir="ltr">
                        {formatDateDisplay(p.paid_date)}
                      </div>
                      <div className="shrink-0 font-bold text-fleet-moss-text">{formatCurrency(p.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {pendingVoidId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => setPendingVoidId(null)}>
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-fleet-navy">{t("mys_void_invoice_confirm")}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPendingVoidId(null)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                {t("no_word")}
              </button>
              <button
                type="button"
                onClick={() => {
                  doVoid(pendingVoidId);
                  setPendingVoidId(null);
                }}
                className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
              >
                {t("yes_word")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
