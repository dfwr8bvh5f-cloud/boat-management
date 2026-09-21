"use client";

import { useRef, useState } from "react";
import { FileText, Pencil, Plus, ReceiptEuro, Trash2, Upload, X } from "lucide-react";
import { createMysIncome, createMysIncomeUploadUrl, updateMysIncome, deleteMysIncome, linkMysIncomeToDebt } from "@/lib/actions/mys";
import type { MysOpenDebtForMatch } from "@/lib/actions/mys";
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
import { formatCurrency, round2 } from "@/lib/money";
import { PAYMENT_METHODS, getPaymentLabels } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysIncome, PaymentMethod } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

type MysIncomeWithUrl = MysIncome & { invoiceUrl: string | null; displayDescription: string };

const debtKey = (d: MysOpenDebtForMatch) => `${d.kind}:${d.id}`;

export function MysIncomeManager({
  income,
  clientNames,
  openDebts,
  locale,
}: {
  income: MysIncomeWithUrl[];
  clientNames: string[];
  openDebts: MysOpenDebtForMatch[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const paymentLabels = getPaymentLabels(locale);

  // --- Add a new income row - matching an open /mys/debts row is only ever
  // offered here, never while editing an existing row (see selectedDebt). ---
  const [showForm, setShowForm] = useState(false);
  const [dateValue, setDateValue] = useState(todayLocalISO());
  const [clientName, setClientName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // "" means no manual choice yet (falls back to a confident auto-match, if
  // any); "__none__" means she explicitly declined a link.
  const [amountValue, setAmountValue] = useState("");
  const [selectedDebtKey, setSelectedDebtKey] = useState("");
  const [showDebtPicker, setShowDebtPicker] = useState(false);
  const parsedAmount = round2(Number(amountValue) || 0);
  const exactMatches = parsedAmount > 0 ? openDebts.filter((d) => round2(d.amount) === parsedAmount) : [];
  const autoMatch = exactMatches.length === 1 ? exactMatches[0] : null;
  const selectedDebt =
    selectedDebtKey === "__none__"
      ? null
      : selectedDebtKey
        ? (openDebts.find((d) => debtKey(d) === selectedDebtKey) ?? null)
        : autoMatch;

  // The invoice is uploaded straight to storage the moment a file is
  // picked (same signed-URL pattern as an expense receipt), and this state
  // holds the resulting path - what actually gets submitted on Save is
  // this path, via the hidden input below, not the File object itself.
  const [invoicePath, setInvoicePath] = useState("");
  const [invoiceName, setInvoiceName] = useState<string | null>(null);
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);

  // Filters the list below by payment method - only shown once there's
  // more than one method actually present, same "only show a filter worth
  // showing" gating as the debts page's per-client summary tiles.
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethod | "">("");
  const paymentMethodsPresent = [...new Set(income.flatMap((i) => (i.payment_method ? [i.payment_method] : [])))];
  const filteredIncome = paymentMethodFilter ? income.filter((i) => i.payment_method === paymentMethodFilter) : income;

  const total = filteredIncome.reduce((s, i) => s + i.amount, 0);

  const startNew = () => {
    setDateValue(todayLocalISO());
    setClientName("");
    setPaymentMethod("");
    setInvoicePath("");
    setInvoiceName(null);
    setInvoiceError(null);
    setSaveError(null);
    setAmountValue("");
    setSelectedDebtKey("");
    setShowDebtPicker(false);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
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
  };

  const doSave = async (formData: FormData) => {
    setSaveError(null);
    setSaving(true);
    try {
      if (selectedDebt) {
        const result = await linkMysIncomeToDebt(formData, selectedDebt.kind, selectedDebt.id, selectedDebt.boatId);
        if (result?.error) {
          setSaveError(result.error);
          return;
        }
      } else {
        await createMysIncome(formData);
      }
      closeForm();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  // --- Edit an existing income row, inline at the row itself (not a form
  // up at the top of the page) - so clicking the pencil on a row far down a
  // long list has a visible effect right there instead of silently opening
  // something off-screen. No debt-matching here (that's create-only). ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAmountValue, setEditAmountValue] = useState("");
  const [editDateValue, setEditDateValue] = useState(todayLocalISO());
  const [editClientName, setEditClientName] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editInvoicePath, setEditInvoicePath] = useState("");
  const [editInvoiceName, setEditInvoiceName] = useState<string | null>(null);
  const [editInvoiceExistingUrl, setEditInvoiceExistingUrl] = useState<string | null>(null);
  const [editInvoiceUploading, setEditInvoiceUploading] = useState(false);
  const [editInvoiceError, setEditInvoiceError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editSaveError, setEditSaveError] = useState<string | null>(null);
  const editInvoiceRef = useRef<HTMLInputElement>(null);

  const startEdit = (i: MysIncomeWithUrl) => {
    setEditingId(i.id);
    setEditDescription(i.description);
    setEditAmountValue(String(i.amount));
    setEditDateValue(i.income_date);
    setEditClientName(i.client_name ?? "");
    setEditPaymentMethod(i.payment_method ?? "");
    setEditNotes(i.notes ?? "");
    setEditInvoicePath(i.invoice_path ?? "");
    setEditInvoiceName(null);
    setEditInvoiceExistingUrl(i.invoiceUrl);
    setEditInvoiceError(null);
    setEditSaveError(null);
  };
  const closeEdit = () => {
    setEditingId(null);
    setEditSaveError(null);
  };

  const onEditInvoiceFile = async (file: File | undefined) => {
    if (!file) return;
    setEditInvoiceError(null);
    let toUpload: File;
    try {
      toUpload = file.type.startsWith("image/") ? await compressImageToLimit(file, MAX_UPLOAD_FILE_BYTES) : file;
    } catch (e) {
      setEditInvoiceError(e instanceof HeicUnsupportedError ? t("heic_not_supported") : e instanceof Error ? e.message : String(e));
      return;
    }
    if (toUpload.size > MAX_UPLOAD_FILE_BYTES) {
      setEditInvoiceError(t("doc_file_too_large"));
      return;
    }
    setEditInvoiceUploading(true);
    try {
      const { path, token } = await createMysIncomeUploadUrl(toUpload.name);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("receipts").uploadToSignedUrl(path, token, toUpload);
      if (uploadError) throw uploadError;
      setEditInvoicePath(path);
      setEditInvoiceName(toUpload.name);
      setEditInvoiceExistingUrl(null);
    } catch (e) {
      setEditInvoiceError(e instanceof Error ? e.message : t("upload_failed"));
    } finally {
      setEditInvoiceUploading(false);
    }
  };
  const { dragging: editInvoiceDragging, dropHandlers: editInvoiceDropHandlers } = useFileDrop(onEditInvoiceFile);
  const clearEditInvoice = () => {
    if (editInvoiceRef.current) editInvoiceRef.current.value = "";
    setEditInvoicePath("");
    setEditInvoiceName(null);
    setEditInvoiceExistingUrl(null);
  };

  const doSaveEdit = async (incomeId: string) => {
    setEditSaveError(null);
    setEditSaving(true);
    try {
      const fd = new FormData();
      fd.set("description", editDescription);
      fd.set("amount", editAmountValue);
      fd.set("income_date", editDateValue);
      fd.set("client_name", editClientName);
      fd.set("payment_method", editPaymentMethod);
      fd.set("invoice_path", editInvoicePath);
      fd.set("notes", editNotes);
      await updateMysIncome(incomeId, fd);
      closeEdit();
    } catch (e) {
      setEditSaveError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setEditSaving(false);
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
        <form action={doSave} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("description")} *</label>
            <input name="description" required className={INPUT_CLASS} />
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
                value={amountValue}
                onChange={(e) => {
                  setAmountValue(e.target.value);
                  setSelectedDebtKey("");
                }}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("date")}</label>
              <DateInput name="income_date" value={dateValue} onChange={setDateValue} locale={locale} className={INPUT_CLASS} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {selectedDebt ? (
              <div className="flex items-center gap-2 rounded-lg border border-fleet-moss bg-fleet-moss/10 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-fleet-navy">
                  <span className="font-semibold">{t("mys_income_debt_match_label")}:</span> {selectedDebt.label}
                  {selectedDebt.clientName && ` · ${selectedDebt.clientName}`} · {formatCurrency(selectedDebt.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedDebtKey("__none__")}
                  aria-label={t("remove_word")}
                  title={t("remove_word")}
                  className="shrink-0 text-fleet-ink hover:text-fleet-coral-text"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              openDebts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDebtPicker((s) => !s)}
                  className="self-start text-xs font-medium text-fleet-brass hover:underline"
                >
                  {t("mys_income_link_debt_cta")}
                </button>
              )
            )}
            {!selectedDebt && (showDebtPicker || (parsedAmount > 0 && exactMatches.length !== 1)) && openDebts.length > 0 && (
              <CustomSelect
                value=""
                onChange={(v) => {
                  setSelectedDebtKey(v || "__none__");
                  setShowDebtPicker(false);
                }}
                options={openDebts.map((d) => ({
                  value: debtKey(d),
                  label: `${d.label}${d.clientName ? ` · ${d.clientName}` : ""} · ${formatCurrency(d.amount)}`,
                }))}
                placeholder={t("mys_income_select_debt_placeholder")}
                searchable
                className={INPUT_CLASS}
              />
            )}
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
            {invoicePath && invoiceName && (
              <FileChip
                icon={<Upload size={14} className="shrink-0" />}
                name={invoiceName}
                onRemove={clearInvoice}
                removeLabel={t("remove_word")}
              />
            )}
            {invoiceError && <p className="text-xs text-fleet-coral-text">{invoiceError}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
            <textarea name="notes" rows={2} className={INPUT_CLASS} />
          </div>
          {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button type="submit" disabled={saving} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
              {saving ? t("saving_word") : t("mys_add_income")}
            </button>
          </div>
        </form>
      )}

      {paymentMethodsPresent.length > 1 && (
        <div>
          <div className="mb-1.5 text-2xs font-bold text-fleet-ink">{t("payment_method")}</div>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.filter((m) => paymentMethodsPresent.includes(m)).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethodFilter((prev) => (prev === method ? "" : method))}
                className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                  paymentMethodFilter === method ? "border-fleet-teal bg-fleet-teal text-white" : "border-fleet-border"
                }`}
              >
                {paymentLabels[method]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-fleet-border bg-white p-4 text-sm font-bold text-fleet-navy">
        {t("total")}: {formatCurrency(total)}
      </div>

      {filteredIncome.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_income")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredIncome.map((i) =>
            editingId === i.id ? (
              <div key={i.id} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-fleet-ink">{t("description")} *</label>
                  <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className={INPUT_CLASS} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("amount")} *</label>
                    <input
                      type="number"
                      step="0.01"
                      onWheel={(e) => e.currentTarget.blur()}
                      value={editAmountValue}
                      onChange={(e) => setEditAmountValue(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("date")}</label>
                    <DateInput value={editDateValue} onChange={setEditDateValue} locale={locale} className={INPUT_CLASS} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_client_label")}</label>
                    <CustomSelect
                      value={editClientName}
                      onChange={setEditClientName}
                      options={[{ value: "", label: t("mys_client_none") }, ...clientNames.map((name) => ({ value: name, label: name }))]}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("payment_method")}</label>
                    <CustomSelect
                      value={editPaymentMethod}
                      onChange={setEditPaymentMethod}
                      options={[{ value: "", label: t("not_set_yet") }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: paymentLabels[m] }))]}
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-fleet-ink">{t("mys_invoice_issued_label")}</label>
                  <input
                    ref={editInvoiceRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => onEditInvoiceFile(e.target.files?.[0])}
                  />
                  <UploadButton
                    onClick={() => editInvoiceRef.current?.click()}
                    dropHandlers={editInvoiceDropHandlers}
                    dragging={editInvoiceDragging}
                    busy={editInvoiceUploading}
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
                      name={editInvoiceName ?? t("mys_invoice_issued_label")}
                      href={editInvoiceExistingUrl ?? undefined}
                      onRemove={clearEditInvoice}
                      removeLabel={t("remove_word")}
                    />
                  )}
                  {editInvoiceError && <p className="text-xs text-fleet-coral-text">{editInvoiceError}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
                  <textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className={INPUT_CLASS} />
                </div>
                {editSaveError && <p className="text-xs text-fleet-coral-text">{editSaveError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={closeEdit} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                    {t("close_word")}
                  </button>
                  <button
                    type="button"
                    disabled={editSaving}
                    onClick={() => doSaveEdit(i.id)}
                    className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
                  >
                    {editSaving ? t("saving_word") : t("save_edit")}
                  </button>
                </div>
              </div>
            ) : (
              <div key={i.id} className="flex flex-nowrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {i.displayDescription}
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
            )
          )}
        </div>
      )}
    </div>
  );
}
