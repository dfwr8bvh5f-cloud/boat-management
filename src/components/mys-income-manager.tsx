"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { FileText, Link2Off, Pencil, Plus, ReceiptEuro, Search, Trash2, Upload, X } from "lucide-react";
import { usePagedList } from "@/lib/hooks/use-paged-list";
import {
  createMysIncome,
  createMysIncomeUploadUrl,
  updateMysIncome,
  deleteMysIncome,
  deleteMysIncomeAttachment,
  linkMysIncomeToDebt,
  linkMysIncomeToDebts,
  relinkMysIncomeToDebt,
  unlinkMysIncomeFromDebt,
} from "@/lib/actions/mys";
import type { MysOpenDebtForMatch } from "@/lib/actions/mys";
import { AttachmentGroup } from "@/components/attachment-group";
import { ConfirmPopup } from "@/components/confirm-popup";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { FileChip } from "@/components/file-chip";
import { RippleLoader } from "@/components/ripple-loader";
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
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SEARCH_INPUT_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

type MysIncomeWithUrl = MysIncome & {
  invoiceUrl: string | null;
  // Set only for a row auto-recorded from a supplier commission payment -
  // every "issued" invoice currently on that commission, resolved live
  // (not a frozen snapshot) so an invoice attached before or after this
  // specific payment, and a commission with more than one, both show.
  // Falls back to the single invoiceUrl icon below when empty.
  issuedInvoices: { id: string; url: string }[];
  // Every invoice directly attached to this row via mys_income_attachments
  // (a plain income entry, not debt-linked) - can be more than one. The
  // legacy invoiceUrl above always duplicates the first of these too.
  attachments: { id: string; path: string; url: string }[];
  displayDescription: string;
};

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
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Empty set + not declined means no manual choice yet (falls back to a
  // confident auto-match, if any); debtLinkDeclined means she explicitly
  // chose "general, no debt" over that auto-match.
  const [amountValue, setAmountValue] = useState("");
  const [selectedDebtKeys, setSelectedDebtKeys] = useState<Set<string>>(new Set());
  const [debtLinkDeclined, setDebtLinkDeclined] = useState(false);
  const [showDebtPicker, setShowDebtPicker] = useState(false);
  const parsedAmount = round2(Number(amountValue) || 0);
  // Narrowed to the chosen client once one's picked, so the picker/auto-
  // match below only ever offers debts that actually belong to them -
  // before that (no client chosen yet), every open debt is still fair game.
  const relevantDebts = clientName ? openDebts.filter((d) => d.clientName === clientName) : openDebts;
  const exactMatches = parsedAmount > 0 ? relevantDebts.filter((d) => round2(d.amount) === parsedAmount) : [];
  const autoMatch = exactMatches.length === 1 ? exactMatches[0] : null;
  const manuallySelectedDebts = relevantDebts.filter((d) => selectedDebtKeys.has(debtKey(d)));
  // A single combined payment (her own amount above) can settle more than
  // one open debt at once - picked by hand from the checklist below, or
  // (same as before) a single confident exact-amount match is offered
  // automatically until she picks something herself.
  const selectedDebts = debtLinkDeclined ? [] : manuallySelectedDebts.length > 0 ? manuallySelectedDebts : autoMatch ? [autoMatch] : [];
  const selectedDebtsTotal = round2(selectedDebts.reduce((s, d) => s + d.amount, 0));
  const toggleDebtKey = (key: string) => {
    setDebtLinkDeclined(false);
    setSelectedDebtKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Each invoice is uploaded straight to storage the moment it's picked
  // (same signed-URL pattern as an expense receipt), and this state holds
  // the resulting paths - more than one can attach to the same income row
  // (see mys_income_attachments) - what actually gets submitted on Save is
  // these paths, via the hidden inputs below, not the File objects.
  const [invoiceFiles, setInvoiceFiles] = useState<{ path: string; name: string }[]>([]);
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);

  // Filters the list below by payment method - only shown once there's
  // more than one method actually present, same "only show a filter worth
  // showing" gating as the debts page's per-client summary tiles.
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethod | "">("");
  const paymentMethodsPresent = [...new Set(income.flatMap((i) => (i.payment_method ? [i.payment_method] : [])))];
  const filteredIncome = useMemo(
    () => (paymentMethodFilter ? income.filter((i) => i.payment_method === paymentMethodFilter) : income),
    [income, paymentMethodFilter]
  );
  // Free-text search narrows the visible list only - it never shrinks the
  // total below, so typing a client's name to find their row can't be
  // mistaken for a real filtered subtotal.
  const [search, setSearch] = useState("");
  const deferredSearchTerm = useDeferredValue(search.trim().toLowerCase());
  const searchedIncome = useMemo(
    () =>
      filteredIncome.filter((i) => {
        if (!deferredSearchTerm) return true;
        return [i.displayDescription, i.client_name, i.notes]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(deferredSearchTerm));
      }),
    [filteredIncome, deferredSearchTerm]
  );

  const total = filteredIncome.reduce((s, i) => s + i.amount, 0);
  const { visibleItems: visibleIncome, hasMore: hasMoreIncome, loadMore: loadMoreIncome } = usePagedList(searchedIncome);

  const startNew = () => {
    setDateValue(todayLocalISO());
    setClientName("");
    setPaymentMethod("");
    setInvoiceFiles([]);
    setInvoiceError(null);
    setSaveError(null);
    setAmountValue("");
    setSelectedDebtKeys(new Set());
    setDebtLinkDeclined(false);
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
      setInvoiceFiles((prev) => [...prev, { path, name: toUpload.name }]);
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : t("upload_failed"));
    } finally {
      setInvoiceUploading(false);
    }
  };
  const { dragging: invoiceDragging, dropHandlers: invoiceDropHandlers } = useFileDrop(onInvoiceFile);
  const removeInvoiceFile = (index: number) => setInvoiceFiles((prev) => prev.filter((_, i) => i !== index));

  const doSave = async (formData: FormData) => {
    setSaveError(null);
    setSaving(true);
    try {
      if (selectedDebts.length > 1) {
        const result = await linkMysIncomeToDebts(
          formData,
          selectedDebts.map((d) => ({ kind: d.kind, id: d.id, boatId: d.boatId, amount: d.amount }))
        );
        if (result?.error) {
          setSaveError(result.error);
          setSaving(false);
          return;
        }
      } else if (selectedDebts.length === 1) {
        const result = await linkMysIncomeToDebt(formData, selectedDebts[0].kind, selectedDebts[0].id, selectedDebts[0].boatId);
        if (result?.error) {
          setSaveError(result.error);
          setSaving(false);
          return;
        }
      } else {
        await createMysIncome(formData);
      }
      setSaving(false);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        closeForm();
      }, 1400);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
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
  // Newly-picked files this edit session only (sent as additional
  // invoice_path values on save) - the existing attachments already on the
  // row (editExistingAttachments) are shown and removed separately, via
  // deleteMysIncomeAttachment, same append-only split as the expenses
  // manager's own receiptFiles/attachments pair.
  const [editInvoiceFiles, setEditInvoiceFiles] = useState<{ path: string; name: string }[]>([]);
  const [editExistingAttachments, setEditExistingAttachments] = useState<{ id: string; path: string; url: string }[]>([]);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);
  const [editInvoiceUploading, setEditInvoiceUploading] = useState(false);
  const [editInvoiceError, setEditInvoiceError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
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
    setEditInvoiceFiles([]);
    // Same legacy-fallback merge as getReceiptFiles (mys-expenses-manager.tsx) -
    // a row saved before mys_income_attachments existed only has invoiceUrl.
    const fromTable = i.attachments;
    const legacyEntry =
      i.invoiceUrl && !fromTable.some((a) => a.path === i.invoice_path) ? [{ id: `${i.id}-invoice-legacy`, path: i.invoice_path ?? "", url: i.invoiceUrl }] : [];
    setEditExistingAttachments([...legacyEntry, ...fromTable]);
    setEditInvoiceError(null);
    setEditSaveError(null);
    setRelinkingKey(null);
    setRelinkError(null);
    setUnlinkConfirmId(null);
    setUnlinkError(null);
  };
  const closeEdit = () => {
    setEditingId(null);
    setEditSaveError(null);
    setRelinkingKey(null);
    setRelinkError(null);
    setUnlinkConfirmId(null);
    setUnlinkError(null);
  };

  // --- Attach an already-existing income row (recorded general, no debt
  // picked at the time) to a specific open debt after the fact - lives
  // inside the same edit form the pencil icon opens (not a separate
  // always-visible affordance on the row), gated on the row not already
  // being linked to something and having a client name to narrow the debt
  // list by (guessing which client an unnamed row belongs to isn't safe).
  // One "+" per candidate debt - no separate select-then-confirm step.
  // relinkingKey tracks the one debt currently being submitted (its own
  // debtKey), so only that row's button shows a loading state - safe since
  // only one row's edit form is ever open at a time. ---
  const [relinkingKey, setRelinkingKey] = useState<string | null>(null);
  const [relinkError, setRelinkError] = useState<string | null>(null);

  const doRelink = async (i: MysIncomeWithUrl, debt: MysOpenDebtForMatch) => {
    setRelinkingKey(debtKey(debt));
    setRelinkError(null);
    try {
      const result = await relinkMysIncomeToDebt(i.id, debt.kind, debt.id, debt.boatId);
      if (result?.error) {
        setRelinkError(result.error);
        return;
      }
    } catch (e) {
      setRelinkError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setRelinkingKey(null);
    }
  };

  // --- The reverse of doRelink above: separates an already-linked income
  // row from the debt/invoice/commission it's settling, keeping the income
  // itself (per her explicit choice - see unlinkMysIncomeFromDebt's own
  // comment, src/lib/actions/mys.ts). Confirmed first since it reopens the
  // debt as unpaid again, same ConfirmPopup pattern as the missing-fields
  // confirm elsewhere in this app. ---
  const [unlinkConfirmId, setUnlinkConfirmId] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const doUnlink = async (incomeId: string) => {
    setUnlinkConfirmId(null);
    setUnlinkingId(incomeId);
    setUnlinkError(null);
    try {
      const result = await unlinkMysIncomeFromDebt(incomeId);
      if (result?.error) setUnlinkError(result.error);
    } catch (e) {
      setUnlinkError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setUnlinkingId(null);
    }
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
      setEditInvoiceFiles((prev) => [...prev, { path, name: toUpload.name }]);
    } catch (e) {
      setEditInvoiceError(e instanceof Error ? e.message : t("upload_failed"));
    } finally {
      setEditInvoiceUploading(false);
    }
  };
  const { dragging: editInvoiceDragging, dropHandlers: editInvoiceDropHandlers } = useFileDrop(onEditInvoiceFile);
  const removeEditPendingFile = (index: number) => setEditInvoiceFiles((prev) => prev.filter((_, i) => i !== index));
  const removeEditExistingAttachment = async (attachment: { id: string; path: string }) => {
    if (!editingId) return;
    setRemovingAttachmentId(attachment.id);
    setEditInvoiceError(null);
    try {
      await deleteMysIncomeAttachment(editingId, attachment.id, attachment.path);
      setEditExistingAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    } catch (e) {
      setEditInvoiceError(e instanceof Error ? e.message : t("remove_file_failed"));
    } finally {
      setRemovingAttachmentId(null);
    }
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
      for (const f of editInvoiceFiles) fd.append("invoice_path", f.path);
      fd.set("notes", editNotes);
      await updateMysIncome(incomeId, fd);
      setEditSaving(false);
      setEditSaved(true);
      setTimeout(() => {
        setEditSaved(false);
        closeEdit();
      }, 1400);
    } catch (e) {
      setEditSaveError(e instanceof Error ? e.message : t("save_failed"));
      setEditSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mys_income_title")}</h1>
        <button
          onClick={() => (showForm ? closeForm() : startNew())}
          className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper transition-transform hover:opacity-90 active:scale-[0.97]"
        >
          {showForm ? (
            <span className="inline-flex items-center gap-1">
              <X size={14} /> {t("close_word")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Plus size={14} /> {t("add_income")}
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
                  setSelectedDebtKeys(new Set());
                  setDebtLinkDeclined(false);
                }}
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
                onChange={(v) => {
                  setClientName(v);
                  setSelectedDebtKeys(new Set());
                  setDebtLinkDeclined(false);
                }}
                options={[{ value: "", label: t("mys_client_none") }, ...clientNames.map((name) => ({ value: name, label: name }))]}
                searchable
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
            {relevantDebts.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDebtPicker((s) => !s)}
                className="self-start text-xs font-medium text-fleet-brass hover:underline"
              >
                {selectedDebts.length > 0
                  ? t("mys_income_debts_edit_selection_cta", { count: selectedDebts.length })
                  : t("mys_income_link_debt_cta")}
              </button>
            )}
            {/* Read-only recap while the checklist itself is closed - the
                checklist below (not this) is what she actually edits, so
                it stays open across multiple checks instead of collapsing
                the moment the first box is ticked, which used to make
                picking a second debt impossible without first removing
                the one she'd just picked. */}
            {selectedDebts.length > 0 && !showDebtPicker && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-fleet-moss bg-fleet-moss/10 px-3 py-2 text-xs">
                <span className="font-semibold text-fleet-navy">{t("mys_income_debt_match_label")}:</span>
                {selectedDebts.map((d) => (
                  <div key={debtKey(d)} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-fleet-navy">
                      {d.label}
                      {d.clientName && ` · ${d.clientName}`} · {formatCurrency(d.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleDebtKey(debtKey(d))}
                      aria-label={t("remove_word")}
                      title={t("remove_word")}
                      className="shrink-0 text-fleet-ink hover:text-fleet-coral-text"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {selectedDebts.length > 1 && (
                  <div className="flex items-center justify-between border-t border-fleet-moss/30 pt-1.5 font-bold text-fleet-navy">
                    <span>{t("mys_income_debts_total_label")}</span>
                    <span dir="ltr">{formatCurrency(selectedDebtsTotal)}</span>
                  </div>
                )}
              </div>
            )}
            {(showDebtPicker || (selectedDebts.length === 0 && parsedAmount > 0 && exactMatches.length !== 1)) && (
              <div className="flex flex-col gap-0.5 rounded-lg border border-fleet-border bg-white p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDebtLinkDeclined(true);
                    setShowDebtPicker(false);
                  }}
                  className="rounded px-2 py-1.5 text-start text-xs font-medium text-fleet-ink hover:bg-fleet-paper"
                >
                  {t("mys_income_general_option")}
                </button>
                {relevantDebts.length > 0 && (
                  <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                    {relevantDebts.map((d) => (
                      <label
                        key={debtKey(d)}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-fleet-paper"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDebtKeys.has(debtKey(d))}
                          onChange={() => toggleDebtKey(debtKey(d))}
                          className="shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate text-fleet-navy">
                          {d.label}
                          {d.clientName && ` · ${d.clientName}`} · {formatCurrency(d.amount)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_invoice_issued_label")}</label>
            {invoiceFiles.map((f) => (
              <input key={f.path} type="hidden" name="invoice_path" value={f.path} />
            ))}
            <input
              ref={invoiceRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                onInvoiceFile(e.target.files?.[0]);
                if (invoiceRef.current) invoiceRef.current.value = "";
              }}
            />
            <UploadButton
              onClick={() => invoiceRef.current?.click()}
              dropHandlers={invoiceDropHandlers}
              dragging={invoiceDragging}
              busy={invoiceUploading}
              done={invoiceFiles.length > 0}
              fullWidth={false}
              icon={<FileText size={16} />}
              label={t("mys_upload_invoice_cta")}
              busyLabel={t("uploading_word")}
              doneLabel={t("add_another_file")}
            />
            {invoiceFiles.length > 0 && (
              <div className="flex flex-col gap-1">
                {invoiceFiles.map((f, idx) => (
                  <FileChip
                    key={f.path}
                    icon={<Upload size={14} className="shrink-0" />}
                    name={f.name}
                    onRemove={() => removeInvoiceFile(idx)}
                    removeLabel={t("remove_word")}
                  />
                ))}
              </div>
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
            <button
              type="submit"
              disabled={saving || saved}
              className={`flex flex-1 items-center justify-center gap-2 ${PRIMARY_BUTTON_CLASS}`}
            >
              {saving ? (
                <>
                  <RippleLoader size="sm" /> {t("saving_word")}
                </>
              ) : saved ? (
                <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
              ) : (
                t("add_income")
              )}
            </button>
          </div>
        </form>
      )}

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fleet-ink" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_placeholder")}
          className={SEARCH_INPUT_CLASS}
        />
      </div>

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

      {searchedIncome.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_income")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleIncome.map((i) =>
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
                    onChange={(e) => {
                      onEditInvoiceFile(e.target.files?.[0]);
                      if (editInvoiceRef.current) editInvoiceRef.current.value = "";
                    }}
                  />
                  <UploadButton
                    onClick={() => editInvoiceRef.current?.click()}
                    dropHandlers={editInvoiceDropHandlers}
                    dragging={editInvoiceDragging}
                    busy={editInvoiceUploading}
                    done={editInvoiceFiles.length > 0 || editExistingAttachments.length > 0}
                    fullWidth={false}
                    icon={<FileText size={16} />}
                    label={t("mys_upload_invoice_cta")}
                    busyLabel={t("uploading_word")}
                    doneLabel={t("add_another_file")}
                  />
                  {(editInvoiceFiles.length > 0 || editExistingAttachments.length > 0) && (
                    <div className="flex flex-wrap items-start gap-2">
                      {editInvoiceFiles.map((f, idx) => (
                        <FileChip
                          key={f.path}
                          icon={<Upload size={14} className="shrink-0" />}
                          name={f.name}
                          onRemove={() => removeEditPendingFile(idx)}
                          removeLabel={t("remove_word")}
                        />
                      ))}
                      {editExistingAttachments.map((a) => (
                        <FileChip
                          key={a.id}
                          icon={<Upload size={14} className="shrink-0" />}
                          name={t("mys_invoice_issued_label")}
                          href={a.url}
                          onRemove={() => removeEditExistingAttachment(a)}
                          removing={removingAttachmentId === a.id}
                          removeLabel={t("remove_word")}
                        />
                      ))}
                    </div>
                  )}
                  {editInvoiceError && <p className="text-xs text-fleet-coral-text">{editInvoiceError}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
                  <textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className={INPUT_CLASS} />
                </div>
                {i.linked_expense_id || i.linked_ad_hoc_charge_id || i.mys_invoice_id || i.linked_commission_id ? (
                  <div className="flex flex-col gap-1.5 rounded-lg border border-fleet-coral/40 bg-fleet-coral/5 p-2.5">
                    <button
                      type="button"
                      disabled={unlinkingId === i.id}
                      onClick={() => setUnlinkConfirmId(i.id)}
                      className="flex items-center gap-1.5 self-start text-xs font-medium text-fleet-coral-text hover:underline disabled:opacity-50"
                    >
                      <Link2Off size={14} /> {t("mys_income_unlink_cta")}
                    </button>
                    {unlinkError && <p className="text-2xs text-fleet-coral-text">{unlinkError}</p>}
                  </div>
                ) : (
                  i.client_name &&
                  openDebts.some((d) => d.clientName === i.client_name) && (
                    <div className="flex flex-col gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper p-2.5">
                      <label className="text-xs text-fleet-ink">{t("mys_income_attach_to_debt_cta")}</label>
                      <div className="flex flex-col gap-1">
                        {openDebts
                          .filter((d) => d.clientName === i.client_name)
                          .map((d) => (
                            <div key={debtKey(d)} className="flex flex-nowrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                              <div className="min-w-0 flex-1 truncate">{d.label}</div>
                              <div className="shrink-0 font-bold text-fleet-navy" dir="ltr">
                                {formatCurrency(d.amount)}
                              </div>
                              <button
                                type="button"
                                disabled={relinkingKey === debtKey(d)}
                                onClick={() => doRelink(i, d)}
                                aria-label={t("mys_income_attach_to_debt_cta")}
                                title={t("mys_income_attach_to_debt_cta")}
                                className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-moss-text disabled:opacity-50"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          ))}
                      </div>
                      {relinkError && <p className="text-2xs text-fleet-coral-text">{relinkError}</p>}
                    </div>
                  )
                )}
                {editSaveError && <p className="text-xs text-fleet-coral-text">{editSaveError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={closeEdit} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                    {t("close_word")}
                  </button>
                  <button
                    type="button"
                    disabled={editSaving || editSaved}
                    onClick={() => doSaveEdit(i.id)}
                    className={`flex flex-1 items-center justify-center gap-2 ${PRIMARY_BUTTON_CLASS}`}
                  >
                    {editSaving ? (
                      <>
                        <RippleLoader size="sm" /> {t("saving_word")}
                      </>
                    ) : editSaved ? (
                      <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
                    ) : (
                      t("save_edit")
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div key={i.id} className="flex flex-col gap-1.5 rounded-xl border border-fleet-border bg-white p-3">
                <div className="flex flex-nowrap items-center gap-3">
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
                  {(() => {
                    // Same legacy-fallback merge as getReceiptFiles
                    // (mys-expenses-manager.tsx) - a row saved before
                    // mys_income_attachments existed only has invoiceUrl.
                    const fromTable = i.attachments;
                    const legacyEntry =
                      i.invoiceUrl && !fromTable.some((a) => a.path === i.invoice_path)
                        ? [{ id: `${i.id}-invoice-legacy`, url: i.invoiceUrl }]
                        : [];
                    const files = [...i.issuedInvoices, ...legacyEntry, ...fromTable.map((a) => ({ id: a.id, url: a.url }))];
                    return (
                      <AttachmentGroup
                        compact
                        bordered={false}
                        files={files}
                        icon={<ReceiptEuro size={14} />}
                        label={t("mys_invoice_issued_label")}
                        onOpen={(url) => window.open(url, "_blank", "noopener,noreferrer")}
                      />
                    );
                  })()}
                  <div className="shrink-0 text-sm font-bold text-fleet-moss-text">{formatCurrency(i.amount)}</div>
                  <button onClick={() => startEdit(i)} aria-label="edit" className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-navy">
                    <Pencil size={16} />
                  </button>
                  <form action={deleteMysIncome.bind(null, i.id)}>
                    <ConfirmSubmitButton
                      locale={locale}
                      confirmMessage={t("mys_delete_income_confirm")}
                      ariaLabel={t("delete_word")}
                      className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                    >
                      <Trash2 size={16} />
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            )
          )}
          {hasMoreIncome && (
            <button
              type="button"
              onClick={loadMoreIncome}
              className="rounded-lg border border-fleet-border bg-white py-2.5 text-sm font-bold text-fleet-teal hover:bg-fleet-paper"
            >
              {t("load_more_word")}
            </button>
          )}
        </div>
      )}

      {unlinkConfirmId && (
        <ConfirmPopup
          message={t("mys_income_unlink_confirm")}
          onConfirm={() => doUnlink(unlinkConfirmId)}
          onCancel={() => setUnlinkConfirmId(null)}
          locale={locale}
        />
      )}
    </div>
  );
}
