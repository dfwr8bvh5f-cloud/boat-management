"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Eye, Plus, ReceiptEuro, Upload, X } from "lucide-react";
import { createMysInvoice, createMysInvoiceUploadUrl, updateMysInvoiceFile } from "@/lib/actions/mys";
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

// Editing an existing invoice (client/description/amount/status), marking
// it paid, and voiding it all now live on the Debts page's own invoice-row
// actions (MysDebtsManager) - this page stays a read-only list plus the two
// things that are genuinely about the invoice-as-a-document: attaching the
// real file issued by the accountant, and viewing the invoice this app
// generated.
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
    </div>
  );
}
