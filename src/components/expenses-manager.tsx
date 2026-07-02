"use client";

import { useRef, useState } from "react";
import { Camera, Filter, Pencil, Sparkles, Trash2 } from "lucide-react";
import { createExpense, updateExpense, deleteExpense, approveExpense } from "@/lib/actions/expenses";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { getCategoryLabels, getExpenseCategories, getPaymentLabels, PAYMENT_METHODS, getPaidByLabels } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatType, Expense, ExpenseCategory } from "@/lib/types/database";

type ScanResult = {
  description?: string | null;
  amount?: number | null;
  expense_date?: string | null;
  invoice_number?: string | null;
  category?: string | null;
};

type ExpenseWithUrl = Expense & { receiptUrl: string | null };

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

function formatCurrency(n: number) {
  return `€${n.toLocaleString("he-IL")}`;
}

export function ExpensesManager({
  boatId,
  boatType,
  expenses,
  canAdd,
  isManagement,
  locale,
}: {
  boatId: string;
  boatType: BoatType;
  expenses: ExpenseWithUrl[];
  canAdd: boolean;
  isManagement: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const categoryLabels = getCategoryLabels(locale);
  const categories = getExpenseCategories(boatType);
  const paymentLabels = getPaymentLabels(locale);
  const paidByLabels = getPaidByLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExpenseWithUrl | null>(null);
  const [payFilter, setPayFilter] = useState<string[]>([]);
  const [catFilter, setCatFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanOk, setScanOk] = useState(false);

  const onReceiptFile = async (file: File | undefined) => {
    if (!file) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/scan-receipt", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanOk(false);
        setScanMsg(data.error ?? t("scan_fail"));
        return;
      }
      const result: ScanResult = data.result ?? {};
      if (result.description && descriptionRef.current) descriptionRef.current.value = result.description;
      if (result.amount != null && amountRef.current) amountRef.current.value = String(result.amount);
      if (result.expense_date && dateRef.current) dateRef.current.value = result.expense_date;
      if (result.invoice_number && invoiceRef.current) invoiceRef.current.value = result.invoice_number;
      if (
        result.category &&
        categoryRef.current &&
        categories.includes(result.category as ExpenseCategory)
      ) {
        categoryRef.current.value = result.category;
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

  const togglePayFilter = (k: string) =>
    setPayFilter((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const toggleCatFilter = (k: string) =>
    setCatFilter((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  const filtered = expenses.filter(
    (e) =>
      (payFilter.length === 0 || payFilter.includes(e.payment_method)) &&
      (catFilter.length === 0 || catFilter.includes(e.category))
  );
  const activeFilterCount = payFilter.length + catFilter.length;

  const startEdit = (e: ExpenseWithUrl) => {
    setEditing(e);
    setShowForm(true);
    setScanMsg(null);
  };
  const startNew = () => {
    setEditing(null);
    setShowForm((s) => (editing ? true : !s));
    setScanMsg(null);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setScanMsg(null);
  };

  const formAction = editing ? updateExpense.bind(null, boatId, editing.id) : createExpense.bind(null, boatId);

  return (
    <div className="flex flex-col gap-4">
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

      {showForm && canAdd && (
        <form
          key={editing?.id ?? "new"}
          action={async (formData) => {
            await formAction(formData);
            closeForm();
          }}
          className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("receipt_invoice_label")}</label>
            <input
              ref={fileRef}
              type="file"
              name="receipt"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => onReceiptFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={scanning}
              className="flex w-fit items-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy disabled:opacity-60"
            >
              {scanning ? <Sparkles size={15} /> : <Camera size={15} />}{" "}
              {scanning
                ? t("scanning")
                : editing?.receiptUrl
                  ? t("replace_file_optional")
                  : t("scan_upload")}
            </button>
            {scanMsg && (
              <div className={`flex items-center gap-1 text-xs ${scanOk ? "text-fleet-moss" : "text-fleet-coral"}`}>
                <Sparkles size={12} /> {scanMsg}
              </div>
            )}
            {editing?.receiptUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={editing.receiptUrl} alt="" className="mt-1 max-h-24 rounded-lg border border-fleet-border" />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("description")} *</label>
            <input ref={descriptionRef} name="description" required defaultValue={editing?.description} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("invoice_number")}</label>
            <input ref={invoiceRef} name="invoice_number" defaultValue={editing?.invoice_number ?? ""} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
            <textarea name="notes" rows={2} defaultValue={editing?.notes ?? ""} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              <input
                ref={dateRef}
                name="expense_date"
                type="date"
                defaultValue={editing?.expense_date ?? new Date().toISOString().slice(0, 10)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("category")}</label>
              <select ref={categoryRef} name="category" defaultValue={editing?.category ?? categories[0]} className={inputClass}>
                {categories.map((k) => (
                  <option key={k} value={k}>
                    {categoryLabels[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("payment_method")}</label>
              <select
                name="payment_method"
                defaultValue={editing?.payment_method ?? PAYMENT_METHODS[0]}
                className={inputClass}
              >
                {PAYMENT_METHODS.map((k) => (
                  <option key={k} value={k}>
                    {paymentLabels[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("paid_by")}</label>
              <select name="paid_by" defaultValue={editing?.paid_by ?? "crew"} className={inputClass}>
                <option value="crew">{paidByLabels.crew}</option>
                <option value="management">{paidByLabels.management}</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="mt-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90"
          >
            {editing ? t("save_edit") : t("add_expense")}
          </button>
        </form>
      )}

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
                }}
                className="w-fit text-xs text-fleet-coral"
              >
                {t("expense_filters_clear")}
              </button>
            )}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("none_expenses")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
              {e.receiptUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.receiptUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
              )}
              <div className="min-w-[140px] flex-1">
                <div className="text-sm">
                  {e.description}
                  {e.invoice_number ? ` · #${e.invoice_number}` : ""}
                </div>
                <div className="text-xs text-fleet-ink">
                  {categoryLabels[e.category]} · {paymentLabels[e.payment_method]} · {paidByLabels[e.paid_by]} ·{" "}
                  {e.expense_date}
                </div>
                {e.notes && <div className="mt-0.5 text-xs text-fleet-ink italic">{e.notes}</div>}
              </div>
              <StatusBadge value={e.status} locale={locale} />
              <div className="font-bold text-fleet-navy">{formatCurrency(e.amount)}</div>
              {isManagement && e.status === "pending" && (
                <form action={approveExpense.bind(null, boatId, e.id)}>
                  <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                    {t("approve")}
                  </button>
                </form>
              )}
              {canAdd && (
                <button onClick={() => startEdit(e)} aria-label="edit" className="text-fleet-ink hover:text-fleet-navy">
                  <Pencil size={16} />
                </button>
              )}
              {(canAdd || (isManagement && e.status === "pending")) && (
                <form action={deleteExpense.bind(null, boatId, e.id, e.receipt_path)}>
                  <ConfirmSubmitButton
                    confirmMessage={e.status === "pending" ? t("reject_expense_confirm") : t("delete_expense_confirm")}
                    className="text-fleet-ink hover:text-fleet-coral"
                  >
                    <Trash2 size={16} />
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
