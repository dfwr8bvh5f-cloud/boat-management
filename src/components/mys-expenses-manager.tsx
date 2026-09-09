"use client";

import { useState } from "react";
import { Pencil, Plus, ReceiptEuro, Trash2, X } from "lucide-react";
import { createMysExpense, updateMysExpense, deleteMysExpense } from "@/lib/actions/mys";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { getMysExpenseCategoryLabels, MYS_EXPENSE_CATEGORIES, getPaymentLabels, PAYMENT_METHODS } from "@/lib/labels";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysExpense, MysExpenseCategory, PaymentMethod } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

export function MysExpensesManager({ expenses, locale }: { expenses: (MysExpense & { receiptUrl: string | null })[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const categoryLabels = getMysExpenseCategoryLabels(locale);
  const paymentLabels = getPaymentLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MysExpense | null>(null);
  const [categoryValue, setCategoryValue] = useState<MysExpenseCategory>("other");
  const [paymentValue, setPaymentValue] = useState<PaymentMethod | "">("");
  const [dateValue, setDateValue] = useState(todayLocalISO());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const startNew = () => {
    setEditing(null);
    setCategoryValue("other");
    setPaymentValue("");
    setDateValue(todayLocalISO());
    setSaveError(null);
    setShowForm(true);
  };
  const startEdit = (e: MysExpense) => {
    setEditing(e);
    setCategoryValue(e.category);
    setPaymentValue(e.payment_method ?? "");
    setDateValue(e.expense_date);
    setSaveError(null);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setSaveError(null);
  };

  const doSave = async (formData: FormData) => {
    setSaveError(null);
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
              <label className="text-xs text-fleet-ink">{t("category")}</label>
              <CustomSelect
                name="category"
                value={categoryValue}
                onChange={(v) => setCategoryValue(v as MysExpenseCategory)}
                options={MYS_EXPENSE_CATEGORIES.map((c) => ({ value: c, label: categoryLabels[c] }))}
                className={INPUT_CLASS}
              />
            </div>
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
              <DateInput name="expense_date" value={dateValue} onChange={setDateValue} locale={locale} className={INPUT_CLASS} />
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
              {saving ? t("saving_word") : editing ? t("save_edit") : t("mys_add_expense")}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-fleet-border bg-white p-4 text-sm font-bold text-fleet-navy">
        {t("total")}: {formatCurrency(total)}
      </div>

      {expenses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_expenses")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {expenses.map((e) => (
            <div key={e.id} className="flex flex-nowrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{e.description}</div>
                <div className="truncate text-xs text-fleet-ink">
                  <span dir="ltr">{formatDateDisplay(e.expense_date)}</span> · {categoryLabels[e.category]}
                  {e.payment_method ? ` · ${paymentLabels[e.payment_method]}` : ""}
                </div>
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
              <form action={deleteMysExpense.bind(null, e.id, e.receipt_path)}>
                <ConfirmSubmitButton
                  locale={locale}
                  confirmMessage={t("mys_delete_expense_confirm")}
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
