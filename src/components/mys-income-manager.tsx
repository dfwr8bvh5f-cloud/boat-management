"use client";

import { useRef, useState } from "react";
import { FileText, Pencil, Plus, ReceiptEuro, Trash2, Upload, X } from "lucide-react";
import { createMysIncome, createMysIncomeUploadUrl, updateMysIncome, deleteMysIncome } from "@/lib/actions/mys";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { FileChip } from "@/components/file-chip";
import { UploadButton } from "@/components/upload-button";
import { compressImageToLimit, HeicUnsupportedError } from "@/lib/image-compress";
import { useFileDrop } from "@/lib/use-file-drop";
import { createClient } from "@/lib/supabase/client";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/upload";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { formatCurrency } from "@/lib/money";
import { PAYMENT_METHODS, getPaymentLabels } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysIncome } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

type MysIncomeWithUrl = MysIncome & { invoiceUrl: string | null };

export function MysIncomeManager({
  income,
  clientNames,
  locale,
}: {
  income: MysIncomeWithUrl[];
  clientNames: string[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const paymentLabels = getPaymentLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MysIncomeWithUrl | null>(null);
  const [dateValue, setDateValue] = useState(todayLocalISO());
  const [clientName, setClientName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The invoice is uploaded straight to storage the moment a file is
  // picked (same signed-URL pattern as an expense receipt), and this state
  // holds the resulting path - what actually gets submitted on Save is
  // this path, via the hidden input below, not the File object itself.
  const [invoicePath, setInvoicePath] = useState("");
  const [invoiceName, setInvoiceName] = useState<string | null>(null);
  const [invoiceExistingUrl, setInvoiceExistingUrl] = useState<string | null>(null);
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);

  const total = income.reduce((s, i) => s + i.amount, 0);

  const startNew = () => {
    setEditing(null);
    setDateValue(todayLocalISO());
    setClientName("");
    setPaymentMethod("");
    setInvoicePath("");
    setInvoiceName(null);
    setInvoiceExistingUrl(null);
    setInvoiceError(null);
    setSaveError(null);
    setShowForm(true);
  };
  const startEdit = (i: MysIncomeWithUrl) => {
    setEditing(i);
    setDateValue(i.income_date);
    setClientName(i.client_name ?? "");
    setPaymentMethod(i.payment_method ?? "");
    setInvoicePath(i.invoice_path ?? "");
    setInvoiceName(null);
    setInvoiceExistingUrl(i.invoiceUrl);
    setInvoiceError(null);
    setSaveError(null);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setSaveError(null);
  };

  const onInvoiceFile = async (file: File | undefined) => {
    if (!file) return;
    setInvoiceError(null);
    let toUpload: File;
    try {
      toUpload = file.type.startsWith("image/") ? await compressImageToLimit(file, MAX_UPLOAD_FILE_BYTES) : file;
    } catch (e) {
      setInvoiceError(e instanceof HeicUnsupportedError ? t("heic_not_supported") : e instanceof Error ? e.message : String(e));
      return;
    }
    if (toUpload.size > MAX_UPLOAD_FILE_BYTES) {
      setInvoiceError(t("doc_file_too_large"));
      return;
    }
    setInvoiceUploading(true);
    try {
      const { path, token } = await createMysIncomeUploadUrl(toUpload.name);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("receipts").uploadToSignedUrl(path, token, toUpload);
      if (uploadError) throw uploadError;
      setInvoicePath(path);
      setInvoiceName(toUpload.name);
      setInvoiceExistingUrl(null);
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : t("upload_failed"));
    } finally {
      setInvoiceUploading(false);
    }
  };
  const { dragging: invoiceDragging, dropHandlers: invoiceDropHandlers } = useFileDrop(onInvoiceFile);
  const clearInvoice = () => {
    if (invoiceRef.current) invoiceRef.current.value = "";
    setInvoicePath("");
    setInvoiceName(null);
    setInvoiceExistingUrl(null);
  };

  const doSave = async (formData: FormData) => {
    setSaveError(null);
    setSaving(true);
    try {
      if (editing) await updateMysIncome(editing.id, formData);
      else await createMysIncome(formData);
      closeForm();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mys_income_title")}</h1>
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
              <Plus size={14} /> {t("mys_add_income")}
            </span>
          )}
        </button>
      </div>

      {showForm && (
        <form
          key={editing?.id ?? "new"}
          action={doSave}
          className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("description")} *</label>
            <input name="description" required defaultValue={editing?.description} className={INPUT_CLASS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("amount")} *</label>
              <input
                name="amount"
                type="number"
                step="0.01"
                required
                onWheel={(e) => e.currentTarget.blur()}
                defaultValue={editing?.amount}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("date")}</label>
              <DateInput name="income_date" value={dateValue} onChange={setDateValue} locale={locale} className={INPUT_CLASS} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("mys_client_label")}</label>
              <CustomSelect
                name="client_name"
                value={clientName}
                onChange={setClientName}
                options={[{ value: "", label: t("mys_client_none") }, ...clientNames.map((name) => ({ value: name, label: name }))]}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("payment_method")}</label>
              <CustomSelect
                name="payment_method"
                value={paymentMethod}
                onChange={setPaymentMethod}
                options={[{ value: "", label: t("not_set_yet") }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: paymentLabels[m] }))]}
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_invoice_issued_label")}</label>
            <input type="hidden" name="invoice_path" value={invoicePath} />
            <input
              ref={invoiceRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => onInvoiceFile(e.target.files?.[0])}
            />
            <UploadButton
              onClick={() => invoiceRef.current?.click()}
              dropHandlers={invoiceDropHandlers}
              dragging={invoiceDragging}
              busy={invoiceUploading}
              done={Boolean(invoicePath)}
              fullWidth={false}
              icon={<FileText size={16} />}
              label={t("mys_upload_invoice_cta")}
              busyLabel={t("uploading_word")}
              doneLabel={t("photo_selected")}
            />
            {invoicePath && (invoiceName || invoiceExistingUrl) && (
              <FileChip
                icon={<Upload size={14} className="shrink-0" />}
                name={invoiceName ?? t("mys_invoice_issued_label")}
                href={invoiceExistingUrl ?? undefined}
                onRemove={clearInvoice}
                removeLabel={t("remove_word")}
              />
            )}
            {invoiceError && <p className="text-xs text-fleet-coral-text">{invoiceError}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
            <textarea name="notes" rows={2} defaultValue={editing?.notes ?? ""} className={INPUT_CLASS} />
          </div>
          {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button type="submit" disabled={saving} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
              {saving ? t("saving_word") : editing ? t("save_edit") : t("mys_add_income")}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-fleet-border bg-white p-4 text-sm font-bold text-fleet-navy">
        {t("total")}: {formatCurrency(total)}
      </div>

      {income.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_income")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {income.map((i) => (
            <div key={i.id} className="flex flex-nowrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  {i.description}
                  {i.client_name && ` · ${i.client_name}`}
                </div>
                <div className="truncate text-xs text-fleet-ink">
                  <span dir="ltr">{formatDateDisplay(i.income_date)}</span>
                  {i.payment_method && ` · ${paymentLabels[i.payment_method]}`}
                  {/* A legacy row can be marked issued without a file (checked
                      before this feature existed) - still shown as plain text
                      so nothing that was true before silently disappears. */}
                  {i.invoice_issued && !i.invoiceUrl && ` · ${t("mys_invoice_issued_label")}`}
                </div>
              </div>
              {i.invoiceUrl && (
                <a
                  href={i.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("mys_invoice_issued_label")}
                  title={t("mys_invoice_issued_label")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                >
                  <ReceiptEuro size={14} />
                </a>
              )}
              <div className="shrink-0 text-sm font-bold text-fleet-moss-text">{formatCurrency(i.amount)}</div>
              <button onClick={() => startEdit(i)} aria-label="edit" className="flex h-8 w-8 items-center justify-center text-fleet-ink hover:text-fleet-navy">
                <Pencil size={14} />
              </button>
              <form action={deleteMysIncome.bind(null, i.id)}>
                <ConfirmSubmitButton
                  locale={locale}
                  confirmMessage={t("mys_delete_income_confirm")}
                  ariaLabel={t("delete_word")}
                  className="flex h-8 w-8 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                >
                  <Trash2 size={14} />
                </ConfirmSubmitButton>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
