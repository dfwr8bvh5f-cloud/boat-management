"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Eye, Pencil, Plus, ReceiptEuro, Trash2, Upload, X } from "lucide-react";
import {
  createMysInvoice,
  createMysInvoiceUploadUrl,
  createMysClient,
  updateMysInvoice,
  updateMysInvoiceFile,
  deleteMysInvoicePermanently,
} from "@/lib/actions/mys";
import { ConfirmPopup } from "@/components/confirm-popup";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { compressImageToLimit, HeicUnsupportedError } from "@/lib/image-compress";
import { createClient } from "@/lib/supabase/client";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/upload";
import { formatDateDisplay } from "@/lib/date-format";
import { formatCurrency, round2 } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysInvoice, MysInvoiceLine, MysInvoicePayment, MysInvoiceStatus } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

// Not-yet-paid (draft/sent) reads as red, paid as green - a clear at-a-
// glance owed/settled signal, confirmed over the earlier draft/sent/paid/
// void palette (draft=paper, sent=brass) which didn't distinguish "still
// owed" from "done" by color at all.
const STATUS_CLASSES: Record<MysInvoiceStatus, string> = {
  draft: "bg-fleet-coral/15 text-fleet-coral-text",
  sent: "bg-fleet-coral/15 text-fleet-coral-text",
  paid: "bg-fleet-moss/15 text-fleet-moss-text",
  void: "bg-fleet-coral/15 text-fleet-coral-text",
};

type InvoiceWithExtras = MysInvoice & { lines: MysInvoiceLine[]; payments: MysInvoicePayment[]; invoiceUrl: string | null };

const NEW_CLIENT_OPTION_VALUE = "__new_client__";

type NewLineDraft = { description: string; quantity: string; unitPrice: string; vatPercent: string };
function newLineDraft(): NewLineDraft {
  return { description: "", quantity: "1", unitPrice: "", vatPercent: "" };
}

// Marking an invoice paid and voiding it live on the Debts page's own
// invoice-row actions (MysDebtsManager) - editing its client/description/
// amount lives on both pages (updateMysInvoice, shared) since it's just as
// much about the document itself as the debt it represents. Refused once
// 'paid' (see updateMysInvoice) - a paid invoice's amount is money already
// reconciled as received, so the pencil is hidden for those rows here too.
export function MysInvoicesManager({
  invoices,
  clientNames,
  clientEmailByName,
  locale,
}: {
  invoices: InvoiceWithExtras[];
  // Same combined boats+ad-hoc-clients list every other MYS client picker
  // uses (fed by mys/invoices/page.tsx) - a picked name that matches a real
  // fleet boat is resolved back to its boat_id server-side (createMysInvoice),
  // so there's no separate "fleet boat" field to pick from here.
  clientNames: string[];
  // Known clients' saved emails (mys_clients.email, /mys/clients) - auto-
  // fills the email field below once the typed/picked client name matches
  // one, without overwriting anything she's already typed there herself.
  clientEmailByName: Record<string, string>;
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
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [newLines, setNewLines] = useState<NewLineDraft[]>([newLineDraft()]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showAddClientForm, setShowAddClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);

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
    setClientName("");
    setClientEmail("");
    setInvoiceTitle("");
    setDueDate("");
    setNewLines([newLineDraft()]);
    setSaveError(null);
    setShowAddClientForm(false);
    setNewClientName("");
    setAddClientError(null);
  };

  // Auto-fills the email from a known client's saved record the moment its
  // name matches - only while she hasn't already typed an email herself, so
  // it never clobbers a manual entry.
  const setClientNameAndAutofillEmail = (name: string) => {
    setClientName(name);
    const knownEmail = clientEmailByName[name];
    if (knownEmail) setClientEmail((prev) => prev || knownEmail);
  };

  const doAddClient = async (formData: FormData) => {
    setAddClientError(null);
    setSavingClient(true);
    try {
      await createMysClient(formData);
      setShowAddClientForm(false);
      setNewClientName("");
    } catch (e) {
      setAddClientError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSavingClient(false);
    }
  };

  const updateNewLine = (index: number, patch: Partial<NewLineDraft>) =>
    setNewLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const addNewLine = () => setNewLines((prev) => [...prev, newLineDraft()]);
  const removeNewLine = (index: number) => setNewLines((prev) => prev.filter((_, i) => i !== index));

  const newLinesSubtotal = round2(
    newLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0)
  );
  const newLinesVat = round2(
    newLines.reduce((s, l) => {
      const amount = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
      return s + round2(amount * ((Number(l.vatPercent) || 0) / 100));
    }, 0)
  );
  const newLinesTotal = round2(newLinesSubtotal + newLinesVat);

  const doSave = async () => {
    setSaveError(null);
    if (!clientName.trim()) {
      setSaveError(t("mys_client_required"));
      return;
    }
    setSaving(true);
    try {
      await createMysInvoice({
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || null,
        title: invoiceTitle,
        dueDate: dueDate || null,
        lines: newLines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
          vatPercent: Number(l.vatPercent) || 0,
        })),
      });
      closeForm();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  // --- Edit an existing invoice (client/description/due-date always;
  // amount/vat only for a lines-less, manually-typed invoice - see
  // updateMysInvoice). Never touches the attached file itself, and never
  // available once the invoice is 'paid' (updateMysInvoice refuses it
  // server-side too). Description starts at exactly inv.description,
  // whatever that already is - never re-derived from the line items. ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editClientName, setEditClientName] = useState("");
  const [editClientEmail, setEditClientEmail] = useState("");
  const [editClientCompanyDetails, setEditClientCompanyDetails] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editVatAmount, setEditVatAmount] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const startEdit = (inv: InvoiceWithExtras) => {
    setEditingId(inv.id);
    setEditDescription(inv.description);
    setEditClientName(inv.client_name);
    setEditClientEmail(inv.client_email ?? "");
    setEditClientCompanyDetails(inv.client_company_details ?? "");
    setEditDueDate(inv.due_date ?? "");
    setEditAmount(String(inv.amount));
    setEditVatAmount(String(inv.vat_amount));
    setEditError(null);
  };
  const closeEdit = () => {
    setEditingId(null);
    setEditError(null);
  };
  const doSaveEdit = async (invoiceId: string) => {
    setEditError(null);
    setEditSaving(true);
    try {
      const fd = new FormData();
      fd.set("client_name", editClientName);
      fd.set("client_email", editClientEmail);
      fd.set("client_company_details", editClientCompanyDetails);
      fd.set("description", editDescription);
      fd.set("due_date", editDueDate);
      fd.set("amount", editAmount);
      fd.set("vat_amount", editVatAmount);
      const result = await updateMysInvoice(invoiceId, fd);
      if (result?.error) {
        setEditError(result.error);
        return;
      }
      closeEdit();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setEditSaving(false);
    }
  };

  // --- Attach/replace/remove the real invoice file issued by the
  // accountant (invoice_path only - see updateMysInvoiceFile) ---
  const [uploadingFileId, setUploadingFileId] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const setFileError = (id: string, msg: string | null) =>
    setFileErrors((prev) => {
      const next = { ...prev };
      if (msg) next[id] = msg;
      else delete next[id];
      return next;
    });

  const onInvoiceFileSelected = async (invoiceId: string, file: File | undefined) => {
    if (!file) return;
    setFileError(invoiceId, null);
    let toUpload: File;
    try {
      toUpload = file.type.startsWith("image/") ? await compressImageToLimit(file, MAX_UPLOAD_FILE_BYTES) : file;
    } catch (e) {
      setFileError(invoiceId, e instanceof HeicUnsupportedError ? t("heic_not_supported") : e instanceof Error ? e.message : String(e));
      return;
    }
    if (toUpload.size > MAX_UPLOAD_FILE_BYTES) {
      setFileError(invoiceId, t("doc_file_too_large"));
      return;
    }
    setUploadingFileId(invoiceId);
    try {
      const { path, token } = await createMysInvoiceUploadUrl(toUpload.name);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("receipts").uploadToSignedUrl(path, token, toUpload);
      if (uploadError) throw uploadError;
      const fd = new FormData();
      fd.set("invoice_path", path);
      await updateMysInvoiceFile(invoiceId, fd);
    } catch (e) {
      setFileError(invoiceId, e instanceof Error ? e.message : t("upload_failed"));
    } finally {
      setUploadingFileId(null);
    }
  };

  const removeInvoiceFile = async (invoiceId: string) => {
    setFileError(invoiceId, null);
    try {
      const fd = new FormData();
      fd.set("invoice_path", "");
      await updateMysInvoiceFile(invoiceId, fd);
    } catch (e) {
      setFileError(invoiceId, e instanceof Error ? e.message : t("save_failed"));
    }
  };

  // --- Permanently delete an invoice (never just void) - deleteMysInvoicePermanently
  // can refuse (payments already recorded against it), same reasoning as
  // deleteMysExpense's own guard-refusal comment: a plain <form action> has
  // nowhere to catch that, so this runs as a click handler instead.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const doDeleteInvoice = async (invoiceId: string) => {
    setDeleteError(null);
    setDeletingId(invoiceId);
    try {
      const result = await deleteMysInvoicePermanently(invoiceId);
      if (result?.error) setDeleteError(result.error);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setDeletingId(null);
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
        <div className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_invoice_title_label")}</label>
            <input
              value={invoiceTitle}
              onChange={(e) => setInvoiceTitle(e.target.value)}
              placeholder={t("mys_invoice_title_placeholder")}
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_ad_hoc_client_name")} *</label>
            <CustomSelect
              value={clientName}
              onChange={(v) => {
                if (v === NEW_CLIENT_OPTION_VALUE) {
                  setShowAddClientForm(true);
                  return;
                }
                setClientNameAndAutofillEmail(v);
              }}
              options={[
                { value: NEW_CLIENT_OPTION_VALUE, label: t("mys_new_client_option") },
                { value: "", label: t("mys_client_select_placeholder") },
                ...clientNames.map((n) => ({ value: n, label: n })),
              ]}
              placeholder={t("mys_client_select_placeholder")}
              emphasizeEmpty
              searchable
              searchPlaceholder={t("mys_client_search_placeholder")}
              className={INPUT_CLASS}
            />
            {showAddClientForm && (
              <div className="flex flex-col gap-2 rounded-lg border border-fleet-border bg-white p-2.5">
                <input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder={t("mys_client_name_label")}
                  className={INPUT_CLASS}
                />
                {addClientError && <p className="text-xs text-fleet-coral-text">{addClientError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingClient || !newClientName.trim()}
                    onClick={async () => {
                      const fd = new FormData();
                      fd.set("name", newClientName.trim());
                      await doAddClient(fd);
                      setClientNameAndAutofillEmail(newClientName.trim());
                    }}
                    className={`px-4 py-1.5 text-xs ${PRIMARY_BUTTON_CLASS}`}
                  >
                    {savingClient ? t("saving_word") : t("mys_add_client")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddClientForm(false);
                      setNewClientName("");
                      setAddClientError(null);
                    }}
                    className={`px-4 py-1.5 text-xs ${SECONDARY_BUTTON_CLASS}`}
                  >
                    {t("close_word")}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("mys_invoice_due_date")}</label>
              <DateInput value={dueDate} onChange={setDueDate} locale={locale} className={INPUT_CLASS} allowClear />
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-fleet-border pt-3">
            <div className="hidden text-2xs font-medium text-fleet-ink sm:grid sm:grid-cols-12 sm:gap-2">
              <div className="sm:col-span-5">{t("mys_invoice_line_item_label")}</div>
              <div className="sm:col-span-2">{t("quantity_label")}</div>
              <div className="sm:col-span-2">{t("unit_price_label")}</div>
              <div className="sm:col-span-2">{t("mys_vat_percent_label")}</div>
              <div className="sm:col-span-1 sm:text-end">{t("line_total_label")}</div>
            </div>
            {newLines.map((line, i) => {
              const lineAmount = round2((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0));
              return (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-lg bg-fleet-paper p-2.5 sm:grid sm:grid-cols-12 sm:items-center sm:gap-2 sm:rounded-none sm:bg-transparent sm:p-0"
                >
                  <input
                    value={line.description}
                    onChange={(e) => updateNewLine(i, { description: e.target.value })}
                    placeholder={t("mys_invoice_line_item_label")}
                    className={`${INPUT_CLASS} sm:col-span-5`}
                  />
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={line.quantity}
                    onChange={(e) => updateNewLine(i, { quantity: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    aria-label={t("quantity_label")}
                    className={`${INPUT_CLASS} sm:col-span-2`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.unitPrice}
                    onChange={(e) => updateNewLine(i, { unitPrice: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    aria-label={t("unit_price_label")}
                    className={`${INPUT_CLASS} sm:col-span-2`}
                  />
                  <div className="flex items-center gap-1 sm:col-span-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={line.vatPercent}
                      onChange={(e) => updateNewLine(i, { vatPercent: e.target.value })}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="0"
                      aria-label={t("mys_vat_percent_label")}
                      className={INPUT_CLASS}
                    />
                    <span className="shrink-0 text-xs text-fleet-ink">%</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                    <span className="text-xs font-bold text-fleet-navy sm:hidden">{t("line_total_label")}</span>
                    <span className="text-xs font-bold text-fleet-navy" dir="ltr">
                      {formatCurrency(lineAmount)}
                    </span>
                    {newLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeNewLine(i)}
                        aria-label={t("delete_word")}
                        className="shrink-0 text-fleet-ink hover:text-fleet-coral-text"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={addNewLine} className="self-start text-xs font-medium text-fleet-brass hover:underline">
              + {t("mys_add_line_item_cta")}
            </button>
          </div>

          <div className="flex flex-col gap-0.5 rounded-lg bg-fleet-paper px-3 py-2 text-xs">
            <div className="flex justify-between">
              <span className="text-fleet-ink">{t("mys_invoice_subtotal_label")}</span>
              <span dir="ltr">{formatCurrency(newLinesSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fleet-ink">{t("mys_vat_amount_label")}</span>
              <span dir="ltr">{formatCurrency(newLinesVat)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-fleet-navy">
              <span>{t("total")}</span>
              <span dir="ltr">{formatCurrency(newLinesTotal)}</span>
            </div>
          </div>

          {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button type="button" disabled={saving} onClick={doSave} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
              {saving ? t("saving_word") : t("mys_add_invoice")}
            </button>
          </div>
        </div>
      )}

      {deleteError && (
        <div className="flex items-center gap-2 rounded-lg border border-fleet-coral bg-fleet-coral/10 px-3 py-2 text-xs text-fleet-coral-text">
          <span className="flex-1">{deleteError}</span>
          <button type="button" onClick={() => setDeleteError(null)} aria-label="dismiss" className="shrink-0 hover:opacity-70">
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
            const expanded = expandedIds.has(inv.id);
            const hasExtra = inv.lines.length > 0 || inv.payments.length > 0;
            const uploading = uploadingFileId === inv.id;
            const fileError = fileErrors[inv.id];
            return (
              <div key={inv.id} className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-3">
                {editingId === inv.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_ad_hoc_client_name")} *</label>
                      <input
                        required
                        value={editClientName}
                        onChange={(e) => setEditClientName(e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
                      <input
                        type="email"
                        value={editClientEmail}
                        onChange={(e) => setEditClientEmail(e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_client_company_details_label")}</label>
                      <textarea
                        rows={2}
                        value={editClientCompanyDetails}
                        onChange={(e) => setEditClientCompanyDetails(e.target.value)}
                        placeholder={t("mys_client_company_details_placeholder")}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("description")}</label>
                      <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className={INPUT_CLASS} />
                    </div>
                    {inv.lines.length === 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-fleet-ink">{t("amount")} *</label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            onWheel={(e) => e.currentTarget.blur()}
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-fleet-ink">{t("mys_vat_amount_label")}</label>
                          <input
                            type="number"
                            step="0.01"
                            onWheel={(e) => e.currentTarget.blur()}
                            value={editVatAmount}
                            onChange={(e) => setEditVatAmount(e.target.value)}
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-2xs text-fleet-ink">{t("mys_invoice_amount_from_lines_hint")}</p>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_due_date")}</label>
                      <DateInput value={editDueDate} onChange={setEditDueDate} locale={locale} className={INPUT_CLASS} allowClear />
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
                    {fileError && <div className="truncate text-2xs font-bold text-fleet-coral-text">{fileError}</div>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-2xs font-bold ${STATUS_CLASSES[inv.status]}`}>
                    {statusLabels[inv.status]}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/mys/invoices/${inv.id}`}
                      aria-label={t("mys_view_invoice_document")}
                      title={t("mys_view_invoice_document")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                    >
                      <Eye size={14} />
                    </Link>
                    {inv.invoiceUrl ? (
                      <>
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
                        <button
                          type="button"
                          onClick={() => removeInvoiceFile(inv.id)}
                          aria-label={t("remove_word")}
                          title={t("remove_word")}
                          className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                        >
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          id={`mys-invoice-file-${inv.id}`}
                          onChange={(e) => onInvoiceFileSelected(inv.id, e.target.files?.[0])}
                        />
                        <label
                          htmlFor={`mys-invoice-file-${inv.id}`}
                          aria-label={t("mys_upload_invoice_cta")}
                          title={t("mys_upload_invoice_cta")}
                          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center text-fleet-ink hover:text-fleet-teal"
                        >
                          {uploading ? <span className="animate-pulse text-2xs">…</span> : <Upload size={14} />}
                        </label>
                      </>
                    )}
                    {inv.status !== "paid" && (
                      <button
                        type="button"
                        onClick={() => startEdit(inv)}
                        aria-label={t("update_word")}
                        title={t("update_word")}
                        className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={deletingId === inv.id}
                      onClick={() => setPendingDeleteId(inv.id)}
                      aria-label={t("delete_word")}
                      title={t("delete_word")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="shrink-0 text-end">
                    <div className="text-sm font-bold text-fleet-navy">{formatCurrency(total)}</div>
                    {inv.vat_amount > 0 && (
                      <div className="text-2xs text-fleet-ink">
                        {t("mys_vat_amount_label")}: {formatCurrency(inv.vat_amount)}
                      </div>
                    )}
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

      {pendingDeleteId && (
        <ConfirmPopup
          message={t("mys_delete_invoice_confirm")}
          locale={locale}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => {
            doDeleteInvoice(pendingDeleteId);
            setPendingDeleteId(null);
          }}
        />
      )}
    </div>
  );
}
