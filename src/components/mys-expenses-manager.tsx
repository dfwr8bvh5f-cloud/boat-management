"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, ReceiptEuro, Trash2, X } from "lucide-react";
import { createMysExpense, updateMysExpense, deleteMysExpense, createMysClient } from "@/lib/actions/mys";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import {
  getMysExpenseCategoryLabels,
  getMysSubcategoryLabels,
  MYS_EXPENSE_CATEGORIES,
  MYS_MARKUP_PRESET_PERCENTAGES,
  MYS_SUBCATEGORIES_BY_CATEGORY,
  getPaymentLabels,
  PAYMENT_METHODS,
} from "@/lib/labels";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { formatCurrency, round2 } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysExpense, MysExpenseCategory, PaymentMethod } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

export function MysExpensesManager({
  expenses,
  clientNames,
  locale,
}: {
  expenses: (MysExpense & { receiptUrl: string | null })[];
  clientNames: string[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const categoryLabels = getMysExpenseCategoryLabels(locale);
  const subcategoryLabels = getMysSubcategoryLabels(locale);
  const paymentLabels = getPaymentLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MysExpense | null>(null);
  const [categoryValue, setCategoryValue] = useState<MysExpenseCategory>("other");
  const [subcategoryValue, setSubcategoryValue] = useState("");
  const [paymentValue, setPaymentValue] = useState<PaymentMethod | "">("");
  const [dateValue, setDateValue] = useState(todayLocalISO());
  const [amountValue, setAmountValue] = useState("");
  const [clientNameValue, setClientNameValue] = useState("");
  const [markupPercentValue, setMarkupPercentValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showAddClientForm, setShowAddClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const subcategoryOptions = MYS_SUBCATEGORIES_BY_CATEGORY[categoryValue] ?? [];
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
  };

  const startNew = () => {
    setEditing(null);
    setCategoryValue("other");
    setPaymentValue("");
    setDateValue(todayLocalISO());
    setAmountValue("");
    setSaveError(null);
    resetCategorySpecificState();
    setShowForm(true);
  };
  const startEdit = (e: MysExpense) => {
    setEditing(e);
    setCategoryValue(e.category);
    setSubcategoryValue(e.subcategory ?? "");
    setPaymentValue(e.payment_method ?? "");
    setDateValue(e.expense_date);
    setAmountValue(String(e.amount));
    setClientNameValue(e.client_name ?? "");
    setMarkupPercentValue(e.markup_percent != null ? String(e.markup_percent) : "");
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
                  setCategoryValue(v as MysExpenseCategory);
                  resetCategorySpecificState();
                }}
                options={MYS_EXPENSE_CATEGORIES.map((c) => ({ value: c, label: categoryLabels[c] }))}
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
                  onChange={setClientNameValue}
                  options={[{ value: "", label: t("mys_client_select_placeholder") }, ...clientNames.map((n) => ({ value: n, label: n }))]}
                  placeholder={t("mys_client_select_placeholder")}
                  emphasizeEmpty
                  searchable
                  searchPlaceholder={t("mys_client_search_placeholder")}
                  className={INPUT_CLASS}
                />
              </div>
            )}
          </div>

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

          {isBoatPayment && (
            <div className="flex flex-col gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-3">
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowAddClientForm((s) => !s)}
                  className="self-start text-xs font-bold text-fleet-teal hover:underline"
                >
                  {showAddClientForm ? t("close_word") : `+ ${t("mys_add_client")}`}
                </button>
                {showAddClientForm && (
                  <div className="flex flex-col gap-2 rounded-lg border border-fleet-border bg-white p-2.5">
                    <input
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder={t("mys_client_name_label")}
                      className={INPUT_CLASS}
                    />
                    {addClientError && <p className="text-xs text-fleet-coral-text">{addClientError}</p>}
                    <button
                      type="button"
                      disabled={savingClient || !newClientName.trim()}
                      onClick={async () => {
                        const fd = new FormData();
                        fd.set("name", newClientName.trim());
                        await doAddClient(fd);
                        setClientNameValue(newClientName.trim());
                      }}
                      className={`self-start px-4 py-1.5 text-xs ${PRIMARY_BUTTON_CLASS}`}
                    >
                      {savingClient ? t("saving_word") : t("mys_add_client")}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-fleet-ink">{t("mys_markup_percent_label")}</label>
                <div className="flex flex-wrap gap-1.5">
                  {MYS_MARKUP_PRESET_PERCENTAGES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setMarkupPercentValue(String(p))}
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        markupPercentValue === String(p)
                          ? "border-fleet-teal bg-fleet-teal text-white"
                          : "border-fleet-border bg-white text-fleet-navy hover:bg-fleet-paper"
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                  <input
                    name="markup_percent"
                    type="number"
                    step="0.1"
                    value={markupPercentValue}
                    onChange={(e) => setMarkupPercentValue(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder={t("mys_markup_custom_placeholder")}
                    className={`w-28 ${INPUT_CLASS}`}
                  />
                </div>
              </div>

              {previewClientPrice != null && (
                <div className="text-sm font-bold text-fleet-navy">
                  {t("mys_client_price_label")}: {formatCurrency(previewClientPrice)}
                </div>
              )}
            </div>
          )}

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
                <div className="truncate text-sm">
                  {e.description}
                  {e.client_name && ` · ${e.client_name}`}
                </div>
                <div className="truncate text-xs text-fleet-ink">
                  <span dir="ltr">{formatDateDisplay(e.expense_date)}</span> · {categoryLabels[e.category]}
                  {e.subcategory ? ` (${subcategoryLabels[e.subcategory] ?? e.subcategory})` : ""}
                  {e.payment_method ? ` · ${paymentLabels[e.payment_method]}` : ""}
                  {e.client_price != null ? ` · ${t("mys_client_price_label")}: ${formatCurrency(e.client_price)}` : ""}
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
