"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  Info,
  Pencil,
  Plus,
  ReceiptEuro,
  Repeat,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { createMysExpense, createMysExpenseUploadUrl, updateMysExpense, deleteMysExpense, createMysClient } from "@/lib/actions/mys";
import { unarchiveMysExpense, updateMysExpenseDateOnly } from "@/lib/actions/mys-bank-statement";
import type { MysExpenseReconciliationFlag } from "@/components/mys-bank-reconciliation-manager";
import { ConfirmPopup } from "@/components/confirm-popup";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { FileChip } from "@/components/file-chip";
import { MysRecurringExpensesPanel } from "@/components/mys-recurring-expenses-panel";
import { UploadButton } from "@/components/upload-button";
import { compressImageToLimit, HeicUnsupportedError } from "@/lib/image-compress";
import { scanReceiptToPdf } from "@/lib/scan-to-pdf";
import { useFileDrop } from "@/lib/use-file-drop";
import { createClient } from "@/lib/supabase/client";
import { downloadXlsx } from "@/lib/xlsx-export";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import {
  getMysExpenseCategoryLabels,
  getMysSubcategoryLabels,
  MYS_EXPENSE_CATEGORIES,
  MYS_MARKUP_PRESET_PERCENTAGES,
  MYS_SUBCATEGORIES_BY_CATEGORY,
  getPaymentLabels,
  PAYMENT_METHODS,
} from "@/lib/labels";
import { addMonthsClampedISO, formatDateDisplay, isDateFarFromToday, todayLocalISO } from "@/lib/date-format";
import { formatCurrency, round2 } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysExpense, MysExpenseCategory, MysExpenseRecurringTemplate, PaymentMethod, RecurrenceFrequency } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

// Sentinel option value for the "add a new client/boat" row pinned to the
// top of the client picker - picking it opens the inline add-client form
// instead of setting clientNameValue, so it can never collide with a real
// (user-typed) client/boat name.
const NEW_CLIENT_OPTION_VALUE = "__new_client__";

type MysExpenseWithUrl = MysExpense & { receiptUrl: string | null };

type ReceiptScanResult = { amount?: number | null; expense_date?: string | null; invoice_number?: string | null };

export function MysExpensesManager({
  expenses,
  archivedExpenses = [],
  clientNames,
  recurringTemplates = [],
  locale,
  reconciliationFlags,
}: {
  expenses: MysExpenseWithUrl[];
  archivedExpenses?: MysExpenseWithUrl[];
  clientNames: string[];
  recurringTemplates?: MysExpenseRecurringTemplate[];
  locale: Locale;
  reconciliationFlags?: Record<string, MysExpenseReconciliationFlag>;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const router = useRouter();
  const categoryLabels = getMysExpenseCategoryLabels(locale);
  const subcategoryLabels = getMysSubcategoryLabels(locale);
  const paymentLabels = getPaymentLabels(locale);
  const reconciliationFlagLabels: Record<MysExpenseReconciliationFlag["type"], string> = {
    date_mismatch: t("reconciliation_flag_date_mismatch"),
    amount_mismatch: t("reconciliation_flag_amount_mismatch"),
    missing: t("reconciliation_flag_missing"),
    matched: t("reconciliation_flag_matched"),
  };
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [applyingDateId, setApplyingDateId] = useState<string | null>(null);
  const applySuggestedDate = async (expenseId: string, suggestedDate: string) => {
    setApplyingDateId(expenseId);
    try {
      await updateMysExpenseDateOnly(expenseId, suggestedDate);
      router.refresh();
    } finally {
      setApplyingDateId(null);
    }
  };

  // deleteMysExpense can refuse (e.g. its mirrored boat expense was already
  // invoiced/bank-reconciled on the boat's side) - a plain <form action>
  // has nowhere to catch that throw, so it crashed the whole page instead
  // of showing her why. Run it as a click handler instead so the refusal
  // shows as an inline message.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; receiptPath: string | null } | null>(null);
  const doDeleteExpense = async (id: string, receiptPath: string | null) => {
    setDeleteError(null);
    setDeletingId(id);
    try {
      const result = await deleteMysExpense(id, receiptPath);
      if (result?.error) {
        setDeleteError(result.error);
        return;
      }
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setDeletingId(null);
    }
  };

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MysExpenseWithUrl | null>(null);
  // No default category/date - "not decided yet" is a real, neutral state,
  // same as the boat side's own expenses (0058_expense_category_optional.sql,
  // 0021_expense_draft_warranty.sql) - forcing a stand-in like "other" or
  // today's date hid genuine "needs a category/date" items.
  const [categoryValue, setCategoryValue] = useState<MysExpenseCategory | "">("");
  const [subcategoryValue, setSubcategoryValue] = useState("");
  const [paymentValue, setPaymentValue] = useState<PaymentMethod | "">("");
  const [dateValue, setDateValue] = useState("");
  const [pendingDateValue, setPendingDateValue] = useState<string | null>(null);
  const onExpenseDateChange = (iso: string) => {
    if (iso && isDateFarFromToday(iso)) setPendingDateValue(iso);
    else setDateValue(iso);
  };
  const [amountValue, setAmountValue] = useState("");
  const [clientNameValue, setClientNameValue] = useState("");
  const [markupPercentValue, setMarkupPercentValue] = useState("");
  const [markupCustomMode, setMarkupCustomMode] = useState(false);
  // Alternative to picking a markup% directly: type the final charge price
  // and let the percentage derive itself from it, live, as a pure computed
  // value (never written into markupPercentValue until she actually
  // switches back to percent mode - see that toggle button below) - so
  // markup_percent (the field actually submitted, see readMysExpenseFields,
  // src/lib/actions/mys.ts) has one real source of truth per mode instead
  // of two state variables racing to update each other.
  const [pricingMode, setPricingMode] = useState<"percent" | "price">("percent");
  const [priceValue, setPriceValue] = useState("");
  const derivedPercentFromPrice = useMemo(() => {
    const amount = Number(amountValue) || 0;
    const price = Number(priceValue) || 0;
    if (amount > 0 && priceValue) return round2(((price - amount) / amount) * 100);
    return null;
  }, [amountValue, priceValue]);
  const effectiveMarkupPercent = pricingMode === "price" ? (derivedPercentFromPrice != null ? String(derivedPercentFromPrice) : "") : markupPercentValue;
  const previewProfit = useMemo(() => {
    if (pricingMode !== "price" || derivedPercentFromPrice == null) return null;
    const amount = Number(amountValue) || 0;
    const price = Number(priceValue) || 0;
    if (price <= amount) return null;
    return { percent: derivedPercentFromPrice, amount: round2(price - amount) };
  }, [pricingMode, derivedPercentFromPrice, amountValue, priceValue]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringNextDate, setRecurringNextDate] = useState("");
  const [recurringFrequency, setRecurringFrequency] = useState<RecurrenceFrequency>("monthly");
  const [recurringEndDate, setRecurringEndDate] = useState("");

  // Ensures the form (wherever it renders - see renderExpenseForm below) is
  // actually scrolled into view once opened, rather than relying on it
  // already being on-screen.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showForm]);

  const [showAddClientForm, setShowAddClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);

  // Receipt/invoice upload + AI scan - mirrors QuickExpenseForm's single-
  // receipt flow (src/components/quick-expense-form.tsx), simplified since
  // MYS expenses only ever carry the one legacy receipt_path field, not the
  // boat side's multi-attachment table.
  const receiptRef = useRef<HTMLInputElement>(null);
  const invoiceNumberRef = useRef<HTMLInputElement>(null);
  const [receiptPath, setReceiptPath] = useState("");
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [receiptExistingUrl, setReceiptExistingUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanOk, setScanOk] = useState(false);

  // Same search box the boat Expenses page has (same placeholder/icon,
  // same name-or-price matching) plus the payment-method/category
  // multi-select pill filter (togglePayFilter/toggleCatFilter, showFilters
  // toggle) - all three combine on filteredExpenses below.
  const [search, setSearch] = useState("");
  const deferredSearchTerm = useDeferredValue(search.trim().toLowerCase());
  const [payFilter, setPayFilter] = useState<PaymentMethod[]>([]);
  const [catFilter, setCatFilter] = useState<MysExpenseCategory[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const togglePayFilter = (k: PaymentMethod) => setPayFilter((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const toggleCatFilter = (k: MysExpenseCategory) => setCatFilter((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const activeFilterCount = payFilter.length + catFilter.length;
  const filteredExpenses = expenses.filter(
    (e) =>
      (payFilter.length === 0 || (e.payment_method != null && payFilter.includes(e.payment_method))) &&
      (catFilter.length === 0 || (e.category != null && catFilter.includes(e.category))) &&
      (deferredSearchTerm === "" ||
        e.description.toLowerCase().includes(deferredSearchTerm) ||
        String(e.amount).includes(deferredSearchTerm) ||
        (e.client_name ?? "").toLowerCase().includes(deferredSearchTerm) ||
        (e.invoice_number ?? "").toLowerCase().includes(deferredSearchTerm) ||
        (e.notes ?? "").toLowerCase().includes(deferredSearchTerm))
  );

  const total = filteredExpenses.reduce((s, e) => s + e.amount, 0);

  const exportExcel = () => {
    const header = [
      t("date"),
      t("description"),
      t("category"),
      t("mys_client_name_label"),
      t("mys_markup_percent_label"),
      t("mys_client_price_label"),
      t("payment_method"),
      t("amount"),
      t("invoice_number"),
      t("new_expense_notes"),
    ];
    const rows = filteredExpenses.map((e) => [
      e.expense_date ?? "",
      e.description,
      e.category ? `${categoryLabels[e.category]}${e.subcategory ? ` (${subcategoryLabels[e.subcategory] ?? e.subcategory})` : ""}` : t("not_set_yet"),
      e.client_name ?? "",
      e.markup_percent ?? "",
      e.client_price ?? "",
      e.payment_method ? paymentLabels[e.payment_method] : "",
      e.amount,
      e.invoice_number ?? "",
      e.notes ?? "",
    ]);
    downloadXlsx("mys-expenses.xlsx", header, rows);
  };

  const subcategoryOptions = categoryValue ? (MYS_SUBCATEGORIES_BY_CATEGORY[categoryValue] ?? []) : [];
  const isBoatPayment = categoryValue === "boat_payment";
  // Live preview only - the real client_price stored on save is always
  // recomputed server-side from amount/markup_percent (see
  // maybeCreateRecurringTemplate-style guard in createMysExpense/
  // updateMysExpense, src/lib/actions/mys.ts), never trusted from here.
  const previewClientPrice = useMemo(() => {
    const amount = Number(amountValue) || 0;
    const percent = Number(markupPercentValue);
    if (!amount || !markupPercentValue || Number.isNaN(percent)) return null;
    return round2(amount * (1 + percent / 100));
  }, [amountValue, markupPercentValue]);

  // Only the fields specific to the category just left - the amount is
  // shared across every category and must survive a switch between them.
  const resetCategorySpecificState = () => {
    setSubcategoryValue("");
    setClientNameValue("");
    setMarkupPercentValue("");
    setMarkupCustomMode(false);
    setPricingMode("percent");
    setPriceValue("");
  };

  const startNew = () => {
    setEditing(null);
    setCategoryValue("");
    setPaymentValue("");
    setDateValue("");
    setPendingDateValue(null);
    setAmountValue("");
    setSaveError(null);
    resetCategorySpecificState();
    setReceiptPath("");
    setReceiptName(null);
    setReceiptExistingUrl(null);
    setScanMsg(null);
    setIsRecurring(false);
    setRecurringNextDate("");
    setRecurringFrequency("monthly");
    setRecurringEndDate("");
    setShowForm(true);
  };
  const startEdit = (e: MysExpenseWithUrl) => {
    setEditing(e);
    setCategoryValue(e.category ?? "");
    setSubcategoryValue(e.subcategory ?? "");
    setPaymentValue(e.payment_method ?? "");
    setDateValue(e.expense_date ?? "");
    setPendingDateValue(null);
    setAmountValue(String(e.amount));
    setClientNameValue(e.client_name ?? "");
    const markupStr = e.markup_percent != null ? String(e.markup_percent) : "";
    setMarkupPercentValue(markupStr);
    setMarkupCustomMode(markupStr !== "" && !MYS_MARKUP_PRESET_PERCENTAGES.some((p) => String(p) === markupStr));
    setPricingMode("percent");
    setPriceValue("");
    setReceiptPath(e.receipt_path ?? "");
    setReceiptName(null);
    setReceiptExistingUrl(e.receiptUrl);
    setScanMsg(null);
    setSaveError(null);
    setIsRecurring(false);
    setRecurringNextDate("");
    setRecurringFrequency("monthly");
    setRecurringEndDate("");
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setSaveError(null);
    setPendingDateValue(null);
  };

  const doSave = async (formData: FormData) => {
    setSaveError(null);
    if (isBoatPayment && !clientNameValue) {
      setSaveError(t("mys_client_required"));
      return;
    }
    setSaving(true);
    try {
      if (editing) await updateMysExpense(editing.id, formData);
      else await createMysExpense(formData);
      closeForm();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  // AI-scans a photographed/PDF receipt for amount, date, and invoice
  // number (never description or category - those stay hand-entered, see
  // the prompt in /api/scan-receipt), then uploads the receipt itself
  // straight to storage. Mirrors QuickExpenseForm.onReceiptFile, trimmed to
  // a single file (no multi-batch/camera/boat-matching - none of that
  // applies here).
  const onReceiptFile = async (file: File | undefined) => {
    if (!file) return;
    setScanning(true);
    setScanMsg(null);
    let converted: File, forScan: File;
    try {
      [converted, forScan] = await Promise.all([
        scanReceiptToPdf(file, MAX_SCAN_FILE_BYTES),
        compressImageToLimit(file, MAX_SCAN_FILE_BYTES),
      ]);
    } catch (e) {
      setScanOk(false);
      setScanMsg(e instanceof HeicUnsupportedError ? t("heic_not_supported") : e instanceof Error ? e.message : String(e));
      setScanning(false);
      return;
    }
    if (forScan.size > MAX_SCAN_FILE_BYTES) {
      setScanOk(true);
      setScanMsg(t("scan_file_too_large_uploaded"));
    } else {
      try {
        const body = new FormData();
        body.set("file", forScan);
        const res = await fetch("/api/scan-receipt", { method: "POST", body });
        const data = await res.json();
        if (!res.ok || data.error) {
          setScanOk(false);
          setScanMsg(data.error ?? t("scan_fail"));
        } else {
          const result: ReceiptScanResult = data.result ?? {};
          if (result.amount != null && amountValue.trim() === "") setAmountValue(String(result.amount));
          if (result.invoice_number && invoiceNumberRef.current && !invoiceNumberRef.current.value.trim()) {
            invoiceNumberRef.current.value = result.invoice_number;
          }
          if (result.expense_date) setDateValue(result.expense_date);
          setScanOk(true);
          setScanMsg(t("scan_ok"));
        }
      } catch {
        setScanOk(false);
        setScanMsg(t("scan_connect_fail"));
      }
    }
    try {
      const { path, token } = await createMysExpenseUploadUrl(converted.name);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("receipts").uploadToSignedUrl(path, token, converted);
      if (uploadError) throw uploadError;
      setReceiptPath(path);
      setReceiptName(converted.name);
      setReceiptExistingUrl(null);
    } catch (e) {
      setScanOk(false);
      setScanMsg(e instanceof Error ? e.message : t("upload_failed"));
    }
    setScanning(false);
  };
  const { dragging: receiptDragging, dropHandlers: receiptDropHandlers } = useFileDrop(onReceiptFile);
  const clearReceipt = () => {
    if (receiptRef.current) receiptRef.current.value = "";
    setReceiptPath("");
    setReceiptName(null);
    setReceiptExistingUrl(null);
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

  const editingRowId = editing?.id ?? null;

  // Rendered either at the top of the page (adding a new expense - no row
  // to anchor to yet) or inline in place of the row being edited, so
  // editing never opens invisibly off-screen above a long, scrolled-down
  // list - it appears exactly where she clicked.
  const renderExpenseForm = () => (
        <form
          key="expense-form"
          ref={formRef}
          action={doSave}
          className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("scan_upload")}</label>
            <input type="hidden" name="receipt_path" value={receiptPath} />
            <input
              ref={receiptRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => onReceiptFile(e.target.files?.[0])}
            />
            <UploadButton
              onClick={() => receiptRef.current?.click()}
              dropHandlers={receiptDropHandlers}
              dragging={receiptDragging}
              busy={scanning}
              done={Boolean(receiptPath)}
              fullWidth={false}
              label={t("scan_upload")}
              busyLabel={t("scanning")}
              doneLabel={t("photo_selected")}
            />
            {scanMsg && (
              <div className={`flex items-center gap-1 text-xs ${scanOk ? "text-fleet-moss-text" : "text-fleet-coral-text"}`}>
                <Sparkles size={14} /> {scanMsg}
              </div>
            )}
            {receiptPath && (receiptName || receiptExistingUrl) && (
              <FileChip
                icon={<ReceiptEuro size={14} className="shrink-0" />}
                name={receiptName ?? t("scan_upload")}
                href={receiptExistingUrl ?? undefined}
                onRemove={clearReceipt}
                removeLabel={t("remove_word")}
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("description")} *</label>
            <input name="description" required defaultValue={editing?.description} className={INPUT_CLASS} />
          </div>
          {/* Subcategory (or, for boat_payment, the client picker) sits
              directly beside the category it depends on, rather than after
              every other field, so choosing a category that has one
              visibly opens it right there. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("category")}</label>
              <CustomSelect
                name="category"
                value={categoryValue}
                onChange={(v) => {
                  setCategoryValue(v as MysExpenseCategory | "");
                  resetCategorySpecificState();
                }}
                options={[{ value: "", label: t("not_set_yet") }, ...MYS_EXPENSE_CATEGORIES.map((c) => ({ value: c, label: categoryLabels[c] }))]}
                placeholder={t("not_set_yet")}
                className={INPUT_CLASS}
              />
            </div>
            {subcategoryOptions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-fleet-ink">{t("mys_subcategory_label")}</label>
                <CustomSelect
                  name="subcategory"
                  value={subcategoryValue}
                  onChange={setSubcategoryValue}
                  options={[{ value: "", label: t("not_set_yet") }, ...subcategoryOptions.map((s) => ({ value: s, label: subcategoryLabels[s] }))]}
                  placeholder={t("not_set_yet")}
                  className={INPUT_CLASS}
                />
              </div>
            )}
            {isBoatPayment && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-fleet-ink">{t("mys_boat_payment_client_label")} *</label>
                <CustomSelect
                  name="client_name"
                  value={clientNameValue}
                  onChange={(v) => {
                    if (v === NEW_CLIENT_OPTION_VALUE) {
                      setShowAddClientForm(true);
                      return;
                    }
                    setClientNameValue(v);
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
                          setClientNameValue(newClientName.trim());
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
            )}
          </div>

          {/* The markup percentage sits directly beside the amount (the
              cost price it's applied to) rather than in a block further
              down, so the "my cost is X, charge the client X+%" flow reads
              as one line. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("amount")} *</label>
              <input
                name="amount"
                type="number"
                step="0.01"
                required
                value={amountValue}
                onChange={(e) => setAmountValue(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={INPUT_CLASS}
              />
            </div>
            {isBoatPayment && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-fleet-ink">{t("mys_markup_percent_label")}</label>
                <input type="hidden" name="markup_percent" value={effectiveMarkupPercent} />
                <div className="flex gap-1 rounded-full bg-fleet-paper p-1 text-2xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setMarkupPercentValue(effectiveMarkupPercent);
                      setMarkupCustomMode(
                        effectiveMarkupPercent !== "" && !MYS_MARKUP_PRESET_PERCENTAGES.some((p) => String(p) === effectiveMarkupPercent)
                      );
                      setPricingMode("percent");
                    }}
                    className={`flex-1 rounded-full px-2 py-1 ${pricingMode === "percent" ? "bg-white text-fleet-navy shadow-sm" : "text-fleet-ink"}`}
                  >
                    {t("mys_pricing_mode_percent")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPricingMode("price");
                      if (previewClientPrice != null) setPriceValue(String(previewClientPrice));
                    }}
                    className={`flex-1 rounded-full px-2 py-1 ${pricingMode === "price" ? "bg-white text-fleet-navy shadow-sm" : "text-fleet-ink"}`}
                  >
                    {t("mys_pricing_mode_price")}
                  </button>
                </div>
                {pricingMode === "percent" ? (
                  <>
                    <CustomSelect
                      value={markupCustomMode ? "custom" : markupPercentValue}
                      onChange={(v) => {
                        if (v === "custom") {
                          setMarkupCustomMode(true);
                        } else {
                          setMarkupCustomMode(false);
                          setMarkupPercentValue(v);
                        }
                      }}
                      options={[
                        { value: "", label: t("not_set_yet") },
                        ...MYS_MARKUP_PRESET_PERCENTAGES.map((p) => ({ value: String(p), label: `${p}%` })),
                        { value: "custom", label: t("mys_markup_custom_option") },
                      ]}
                      placeholder={t("not_set_yet")}
                      className={INPUT_CLASS}
                    />
                    {markupCustomMode && (
                      <input
                        type="number"
                        step="0.1"
                        value={markupPercentValue}
                        onChange={(e) => setMarkupPercentValue(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder={t("mys_markup_custom_placeholder")}
                        className={INPUT_CLASS}
                      />
                    )}
                    {previewClientPrice != null && (
                      <div className="text-xs font-bold text-fleet-navy">
                        {t("mys_client_price_label")}: {formatCurrency(previewClientPrice)}
                      </div>
                    )}
                  </>
                ) : (
                  <input
                    type="number"
                    step="0.01"
                    value={priceValue}
                    onChange={(e) => setPriceValue(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder={t("mys_charge_price_placeholder")}
                    className={INPUT_CLASS}
                  />
                )}
                {previewProfit != null && (
                  <div className="text-xs font-bold text-fleet-moss-text">
                    {t("mys_profit_preview_label", { percent: previewProfit.percent, amount: formatCurrency(previewProfit.amount) })}
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("date")}</label>
              <DateInput name="expense_date" value={dateValue} onChange={onExpenseDateChange} locale={locale} className={INPUT_CLASS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("payment_method")}</label>
              <CustomSelect
                name="payment_method"
                value={paymentValue}
                onChange={(v) => setPaymentValue(v as PaymentMethod | "")}
                options={[{ value: "", label: t("not_set_yet") }, ...PAYMENT_METHODS.map((k) => ({ value: k, label: paymentLabels[k] }))]}
                placeholder={t("not_set_yet")}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("invoice_number")}</label>
              <input ref={invoiceNumberRef} name="invoice_number" defaultValue={editing?.invoice_number ?? ""} className={INPUT_CLASS} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
            <textarea name="notes" rows={2} defaultValue={editing?.notes ?? ""} className={INPUT_CLASS} />
          </div>
          {editing?.recurring_template_id ? (
            // Already scheduled from a template - offering the checkbox
            // again here would create a second, competing one (see
            // maybeCreateMysRecurringTemplate's guard in mys.ts). Managing
            // it (editing the schedule, stopping it) happens in the
            // "manage recurring expenses" panel above instead.
            <div className="flex items-center gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-xs text-fleet-ink">
              <Info size={14} className="shrink-0 text-fleet-brass" />
              {t("recurring_already_linked_hint")}
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-fleet-navy">
                <input
                  type="checkbox"
                  name="is_recurring"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="h-4 w-4"
                />
                <Repeat size={16} className="text-fleet-brass" /> {t("recurring_checkbox_label")}
              </label>
              {isRecurring && (
                <div className="flex flex-col gap-2 ps-6">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("recurring_frequency_label")}</label>
                      <input type="hidden" name="recurring_frequency" value={recurringFrequency} />
                      <CustomSelect
                        value={recurringFrequency}
                        onChange={(v) => setRecurringFrequency(v as RecurrenceFrequency)}
                        options={[
                          { value: "weekly", label: t("recurring_frequency_weekly") },
                          { value: "monthly", label: t("recurring_frequency_monthly") },
                          { value: "quarterly", label: t("recurring_frequency_quarterly") },
                          { value: "yearly", label: t("recurring_frequency_yearly") },
                        ]}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("recurring_next_date_label")}</label>
                      <DateInput
                        name="recurring_next_date"
                        value={recurringNextDate}
                        onChange={setRecurringNextDate}
                        locale={locale}
                        className={INPUT_CLASS}
                        min={todayLocalISO()}
                      />
                    </div>
                    {recurringFrequency !== "weekly" && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-fleet-ink">{t("recurring_day_of_month_label")}</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={recurringNextDate ? Number(recurringNextDate.split("-")[2]) : ""}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) => {
                            const day = Number(e.target.value);
                            if (recurringNextDate && day >= 1 && day <= 31) setRecurringNextDate(addMonthsClampedISO(recurringNextDate, 0, day));
                          }}
                          className={INPUT_CLASS}
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("recurring_end_date_label")}</label>
                      <DateInput
                        name="recurring_end_date"
                        value={recurringEndDate}
                        onChange={setRecurringEndDate}
                        locale={locale}
                        className={INPUT_CLASS}
                        allowClear
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button type="submit" disabled={saving} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
              {saving ? t("saving_word") : editing ? t("save_edit") : t("mys_add_expense")}
            </button>
          </div>
        </form>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mys_expenses_title")}</h1>
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
              <Plus size={14} /> {t("mys_add_expense")}
            </span>
          )}
        </button>
      </div>

      <MysRecurringExpensesPanel templates={recurringTemplates} clientNames={clientNames} locale={locale} />

      {showForm && !editingRowId && renderExpenseForm()}

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fleet-ink" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_placeholder")}
          className="w-full rounded-lg border border-fleet-border bg-white py-2 ps-9 pe-3 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={exportExcel}
          className="flex items-center gap-1.5 rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
        >
          <Download size={14} /> {t("export_excel")}
        </button>
      </div>

      <div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
            activeFilterCount > 0 ? "border-fleet-teal text-fleet-teal" : "border-fleet-border text-fleet-navy"
          }`}
        >
          <Filter size={14} /> {t("expense_filters")}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
        {showFilters && (
          <div className="mt-2 flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-3">
            <div>
              <div className="mb-1.5 text-2xs font-bold text-fleet-ink">{t("payment_method")}</div>
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
              <div className="mb-1.5 text-2xs font-bold text-fleet-ink">{t("category")}</div>
              <div className="flex flex-wrap gap-1.5">
                {MYS_EXPENSE_CATEGORIES.map((k) => (
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
                }}
                className="w-fit text-xs text-fleet-coral-text"
              >
                {t("expense_filters_clear")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-fleet-border bg-white p-4 text-sm font-bold text-fleet-navy">
        {t("total")}: {formatCurrency(total)}
      </div>

      {deleteError && (
        <div className="flex items-center gap-2 rounded-lg border border-fleet-coral bg-fleet-coral/10 px-3 py-2 text-xs text-fleet-coral-text">
          <span className="flex-1">{deleteError}</span>
          <button type="button" onClick={() => setDeleteError(null)} aria-label="dismiss" className="shrink-0 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      {filteredExpenses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_expenses")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredExpenses.map((e) => {
            const flag = reconciliationFlags?.[e.id];
            if (editingRowId === e.id) {
              return <div key={e.id}>{renderExpenseForm()}</div>;
            }
            return (
            <div
              key={e.id}
              className={`flex flex-nowrap items-center gap-3 rounded-xl border p-3 ${
                flag?.type === "matched"
                  ? "border-fleet-moss bg-fleet-moss/15"
                  : flag
                    ? "border-fleet-coral bg-fleet-coral/5"
                    : "border-fleet-border bg-white"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  {e.description}
                  {e.client_name && ` · ${e.client_name}`}
                </div>
                <div className="truncate text-xs text-fleet-ink">
                  <span dir="ltr">{e.expense_date ? formatDateDisplay(e.expense_date) : t("not_set_yet")}</span> ·{" "}
                  {e.category ? categoryLabels[e.category] : t("not_set_yet")}
                  {e.subcategory ? ` (${subcategoryLabels[e.subcategory] ?? e.subcategory})` : ""}
                  {e.payment_method ? ` · ${paymentLabels[e.payment_method]}` : ""}
                  {e.client_price != null ? ` · ${t("mys_client_price_label")}: ${formatCurrency(e.client_price)}` : ""}
                </div>
                {e.linked_expense_id && (
                  <div className="truncate text-2xs font-bold text-fleet-teal">
                    {t("mys_linked_boat_expense_note", { boat: e.client_name ?? "" })}
                  </div>
                )}
                {e.linked_ad_hoc_charge_id && (
                  <div className="truncate text-2xs font-bold text-fleet-teal">
                    {t("mys_linked_debt_charge_note", { client: e.client_name ?? "" })}
                  </div>
                )}
                {flag && flag.type === "matched" ? (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-fleet-moss-text">
                    <CheckCircle2 size={14} /> {reconciliationFlagLabels[flag.type]}
                  </div>
                ) : flag ? (
                  <div
                    className={`mt-0.5 flex items-center gap-1.5 text-xs font-bold ${
                      flag.type === "date_mismatch" ? "text-fleet-brass" : "text-fleet-coral-text"
                    }`}
                  >
                    <AlertTriangle size={14} /> {reconciliationFlagLabels[flag.type]}
                    {flag.suggestedDate && (
                      <button
                        type="button"
                        disabled={applyingDateId === e.id}
                        onClick={() => applySuggestedDate(e.id, flag.suggestedDate as string)}
                        title={t("reconciliation_apply_suggested_date", { date: formatDateDisplay(flag.suggestedDate) })}
                        className="flex items-center gap-1 rounded-full border border-fleet-coral px-2 py-0.5 font-semibold text-fleet-coral-text hover:bg-fleet-coral/10 disabled:opacity-60"
                      >
                        <ArrowLeftRight size={14} /> <span dir="ltr">{formatDateDisplay(flag.suggestedDate)}</span>
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
              {e.receiptUrl && (
                <a
                  href={e.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("view_receipt")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                >
                  <ReceiptEuro size={14} />
                </a>
              )}
              <div className="shrink-0 text-sm font-bold text-fleet-navy">{formatCurrency(e.amount)}</div>
              <button onClick={() => startEdit(e)} aria-label="edit" className="flex h-8 w-8 items-center justify-center text-fleet-ink hover:text-fleet-navy">
                <Pencil size={14} />
              </button>
              <button
                type="button"
                disabled={deletingId === e.id}
                onClick={() => setPendingDelete({ id: e.id, receiptPath: e.receipt_path })}
                aria-label={t("delete_word")}
                className="flex h-8 w-8 items-center justify-center text-fleet-ink hover:text-fleet-coral-text disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </div>
            );
          })}
        </div>
      )}

      {archivedExpenses.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setArchivedOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-full border border-fleet-border bg-white px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
          >
            <Archive size={14} /> {t("expense_archived_title", { count: archivedExpenses.length })}
            {archivedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      )}
      {archivedOpen && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-fleet-border bg-fleet-paper p-3">
          <p className="text-2xs text-fleet-ink">{t("expense_archived_hint")}</p>
          {archivedExpenses.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-lg bg-white p-2.5 text-xs">
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-fleet-navy">{e.description}</div>
                <div className="text-fleet-ink" dir="ltr">
                  {e.expense_date ? formatDateDisplay(e.expense_date) : t("not_set_yet")} ·{" "}
                  {e.category ? categoryLabels[e.category] : t("not_set_yet")}
                </div>
              </div>
              <div className="shrink-0 font-bold text-fleet-navy">{formatCurrency(e.amount)}</div>
              {e.receiptUrl && (
                <a
                  href={e.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("view_receipt")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                >
                  <ReceiptEuro size={14} />
                </a>
              )}
              <form action={unarchiveMysExpense.bind(null, e.id)} className="shrink-0">
                <button
                  type="submit"
                  title={t("recon_unarchive_record")}
                  aria-label={t("recon_unarchive_record")}
                  className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-teal"
                >
                  <ArrowLeftRight size={14} />
                </button>
              </form>
              <button
                type="button"
                disabled={deletingId === e.id}
                onClick={() => setPendingDelete({ id: e.id, receiptPath: e.receipt_path })}
                aria-label={t("delete_word")}
                className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <ConfirmPopup
          message={t("mys_delete_expense_confirm")}
          locale={locale}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            doDeleteExpense(pendingDelete.id, pendingDelete.receiptPath);
            setPendingDelete(null);
          }}
        />
      )}

      {pendingDateValue && (
        <ConfirmPopup
          message={t("expense_date_far_confirm", { date: formatDateDisplay(pendingDateValue) })}
          locale={locale}
          onCancel={() => setPendingDateValue(null)}
          onConfirm={() => {
            setDateValue(pendingDateValue);
            setPendingDateValue(null);
          }}
        />
      )}
    </div>
  );
}
