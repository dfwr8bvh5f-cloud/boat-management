"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, ChevronDown, ChevronUp, Pencil, Plus, Repeat, RotateCcw, Trash2 } from "lucide-react";
import {
  confirmMysRecurringExpense,
  deleteMysRecurringExpenseTemplate,
  setMysRecurringExpenseTemplateActive,
  updateMysRecurringExpenseTemplate,
} from "@/lib/actions/mys-recurring-expenses";
import { ConfirmPopup } from "@/components/confirm-popup";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { getMysExpenseCategoryLabels, getMysSubcategoryLabels, getPaymentLabels, MYS_EXPENSE_CATEGORIES, MYS_SUBCATEGORIES_BY_CATEGORY, PAYMENT_METHODS } from "@/lib/labels";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysExpenseCategory, MysExpenseRecurringTemplate, PaymentMethod } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

type Draft = {
  category: MysExpenseCategory | "";
  subcategory: string;
  description: string;
  invoiceNumber: string;
  amount: string;
  paymentMethod: PaymentMethod | "";
  clientName: string;
  markupPercent: string;
  date: string;
  notes: string;
};

function draftFromTemplate(tpl: MysExpenseRecurringTemplate, date: string): Draft {
  return {
    category: tpl.category ?? "",
    subcategory: tpl.subcategory ?? "",
    description: tpl.description,
    invoiceNumber: tpl.invoice_number ?? "",
    amount: String(tpl.amount),
    paymentMethod: tpl.payment_method ?? "",
    clientName: tpl.client_name ?? "",
    markupPercent: tpl.markup_percent != null ? String(tpl.markup_percent) : "",
    date,
    notes: tpl.notes ?? "",
  };
}

function draftToFormData(draft: Draft, dateFieldName: "expense_date" | "next_due_date"): FormData {
  const fd = new FormData();
  fd.set("category", draft.category);
  fd.set("subcategory", draft.subcategory);
  fd.set("description", draft.description);
  fd.set("invoice_number", draft.invoiceNumber);
  fd.set("amount", draft.amount);
  fd.set("payment_method", draft.paymentMethod);
  if (draft.category === "boat_payment") {
    fd.set("client_name", draft.clientName);
    fd.set("markup_percent", draft.markupPercent);
  }
  fd.set(dateFieldName, draft.date);
  fd.set("notes", draft.notes);
  return fd;
}

// Shared editable field set for a due-suggestion's "edit before adding" form
// and for editing an already-scheduled template - same fields either way,
// just a different date label/name (expense_date for confirming an
// occurrence, next_due_date for rescheduling the template itself). Mirrors
// DraftFields in recurring-expenses-panel.tsx (the boat-side equivalent),
// trimmed/adapted to mys_expenses' own field set (category+subcategory
// instead of paid_by/is_warranty, plus the boat_payment client/markup pair).
function DraftFields({
  draft,
  onChange,
  clientNames,
  locale,
  dateLabel,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  clientNames: string[];
  locale: Locale;
  dateLabel: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const categoryLabels = getMysExpenseCategoryLabels(locale);
  const subcategoryLabels = getMysSubcategoryLabels(locale);
  const paymentLabels = getPaymentLabels(locale);
  const isBoatPayment = draft.category === "boat_payment";
  const subcategoryOptions = draft.category ? (MYS_SUBCATEGORIES_BY_CATEGORY[draft.category] ?? []) : [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("description")}</label>
        <input value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} className={INPUT_CLASS} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("category")}</label>
          <CustomSelect
            value={draft.category}
            onChange={(v) => onChange({ ...draft, category: v as MysExpenseCategory | "", subcategory: "", clientName: "", markupPercent: "" })}
            options={[{ value: "", label: t("not_set_yet") }, ...MYS_EXPENSE_CATEGORIES.map((c) => ({ value: c, label: categoryLabels[c] }))]}
            className={INPUT_CLASS}
          />
        </div>
        {subcategoryOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_subcategory_label")}</label>
            <CustomSelect
              value={draft.subcategory}
              onChange={(v) => onChange({ ...draft, subcategory: v })}
              options={[{ value: "", label: t("not_set_yet") }, ...subcategoryOptions.map((s) => ({ value: s, label: subcategoryLabels[s] }))]}
              className={INPUT_CLASS}
            />
          </div>
        )}
        {isBoatPayment && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_boat_payment_client_label")}</label>
            <CustomSelect
              value={draft.clientName}
              onChange={(v) => onChange({ ...draft, clientName: v })}
              options={[{ value: "", label: t("mys_client_select_placeholder") }, ...clientNames.map((n) => ({ value: n, label: n }))]}
              searchable
              searchPlaceholder={t("mys_client_search_placeholder")}
              className={INPUT_CLASS}
            />
          </div>
        )}
        {isBoatPayment && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_markup_percent_label")}</label>
            <input
              type="number"
              step="0.1"
              value={draft.markupPercent}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => onChange({ ...draft, markupPercent: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("amount")}</label>
          <input
            type="number"
            step="0.01"
            value={draft.amount}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => onChange({ ...draft, amount: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{dateLabel}</label>
          <DateInput value={draft.date} onChange={(v) => onChange({ ...draft, date: v })} locale={locale} className={INPUT_CLASS} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("payment_method")}</label>
          <CustomSelect
            value={draft.paymentMethod}
            onChange={(v) => onChange({ ...draft, paymentMethod: v as PaymentMethod | "" })}
            options={[{ value: "", label: t("not_set_yet") }, ...PAYMENT_METHODS.map((k) => ({ value: k, label: paymentLabels[k] }))]}
            className={INPUT_CLASS}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("invoice_number")}</label>
        <input value={draft.invoiceNumber} onChange={(e) => onChange({ ...draft, invoiceNumber: e.target.value })} className={INPUT_CLASS} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
        <textarea rows={2} value={draft.notes} onChange={(e) => onChange({ ...draft, notes: e.target.value })} className={INPUT_CLASS} />
      </div>
    </div>
  );
}

// The due-suggestions banner (templates whose next_due_date has arrived)
// plus a collapsible list for managing every recurring template (upcoming
// and stopped) - shown above the normal expense form, see
// mys-expenses-manager.tsx. Recurring templates themselves are created from
// that form's own "recurring expense" checkbox (createMysExpense,
// src/lib/actions/mys.ts), not here. Mirrors recurring-expenses-panel.tsx
// (the boat-side equivalent) field-for-field on the interaction pattern.
export function MysRecurringExpensesPanel({
  templates,
  clientNames,
  locale,
}: {
  templates: MysExpenseRecurringTemplate[];
  clientNames: string[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const router = useRouter();
  const today = todayLocalISO();

  const dueTemplates = templates.filter((tpl) => tpl.active && tpl.next_due_date <= today);
  const upcomingTemplates = templates.filter((tpl) => tpl.active && tpl.next_due_date > today);
  const stoppedTemplates = templates.filter((tpl) => !tpl.active);

  const [manageOpen, setManageOpen] = useState(false);
  const [editingDueId, setEditingDueId] = useState<string | null>(null);
  const [dueDraft, setDueDraft] = useState<Draft | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<Draft | null>(null);
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const confirmDue = async (tpl: MysExpenseRecurringTemplate, draft: Draft) => {
    setConfirmError(null);
    setConfirmingId(tpl.id);
    try {
      await confirmMysRecurringExpense(tpl.id, draftToFormData(draft, "expense_date"));
      router.refresh();
      setEditingDueId(null);
      setDueDraft(null);
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setConfirmingId(null);
    }
  };

  const stopTemplate = async (templateId: string) => {
    setBusyId(templateId);
    try {
      await setMysRecurringExpenseTemplateActive(templateId, false);
      router.refresh();
    } finally {
      setBusyId(null);
      setStoppingId(null);
    }
  };

  const resumeTemplate = async (templateId: string) => {
    setBusyId(templateId);
    try {
      await setMysRecurringExpenseTemplateActive(templateId, true);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const saveTemplate = async (templateId: string) => {
    if (!templateDraft) return;
    setTemplateError(null);
    setSavingTemplateId(templateId);
    try {
      await updateMysRecurringExpenseTemplate(templateId, draftToFormData(templateDraft, "next_due_date"));
      router.refresh();
      setEditingTemplateId(null);
      setTemplateDraft(null);
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSavingTemplateId(null);
    }
  };

  const deleteTemplate = async (templateId: string) => {
    setBusyId(templateId);
    try {
      await deleteMysRecurringExpenseTemplate(templateId);
      router.refresh();
    } finally {
      setBusyId(null);
      setDeletingId(null);
    }
  };

  if (templates.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {dueTemplates.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-fleet-brass bg-fleet-brass/10 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fleet-brass">
            <Repeat size={14} /> {t("recurring_due_title", { count: dueTemplates.length })}
          </div>
          <div className="flex flex-col gap-2">
            {dueTemplates.map((tpl) => (
              <div key={tpl.id} className="flex flex-col gap-2 rounded-lg border border-fleet-border bg-white p-3">
                {editingDueId === tpl.id && dueDraft ? (
                  <>
                    <DraftFields draft={dueDraft} onChange={setDueDraft} clientNames={clientNames} locale={locale} dateLabel={t("date")} />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDueId(null);
                          setDueDraft(null);
                        }}
                        className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}
                      >
                        {t("close_word")}
                      </button>
                      <button
                        type="button"
                        disabled={confirmingId === tpl.id}
                        onClick={() => confirmDue(tpl, dueDraft)}
                        className={`flex flex-1 items-center justify-center gap-1 ${PRIMARY_BUTTON_CLASS}`}
                      >
                        <Plus size={14} /> {t("recurring_add_this")}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-fleet-navy">{tpl.description}</div>
                      <div className="text-xs text-fleet-ink">
                        {formatCurrency(tpl.amount)} · <span dir="ltr">{formatDateDisplay(tpl.next_due_date)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDueId(tpl.id);
                          setDueDraft(draftFromTemplate(tpl, tpl.next_due_date));
                        }}
                        aria-label="edit"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-fleet-border text-fleet-ink hover:bg-fleet-paper"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setStoppingId(tpl.id)}
                        aria-label={t("recurring_stop")}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-fleet-border text-fleet-coral-text hover:bg-fleet-paper"
                      >
                        <Ban size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={confirmingId === tpl.id}
                        onClick={() => confirmDue(tpl, draftFromTemplate(tpl, tpl.next_due_date))}
                        className="flex h-8 items-center gap-1 rounded-lg bg-fleet-teal px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
                      >
                        <Plus size={14} /> {t("recurring_add_this")}
                      </button>
                    </div>
                  </div>
                )}
                {confirmError && confirmingId === null && <p className="text-xs text-fleet-coral-text">{confirmError}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(upcomingTemplates.length > 0 || stoppedTemplates.length > 0) && (
        <div className="rounded-xl border border-fleet-border bg-white">
          <button
            type="button"
            onClick={() => setManageOpen((s) => !s)}
            className="flex w-full items-center justify-between gap-2 p-3 text-sm font-bold text-fleet-navy"
          >
            <span className="inline-flex items-center gap-1.5">
              <Repeat size={14} /> {t("recurring_manage_title", { count: upcomingTemplates.length + stoppedTemplates.length })}
            </span>
            {manageOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {manageOpen && (
            <div className="flex flex-col gap-2 border-t border-fleet-border p-3">
              {[...upcomingTemplates, ...stoppedTemplates].map((tpl) => (
                <div key={tpl.id} className="flex flex-col gap-2 rounded-lg border border-fleet-border p-3">
                  {editingTemplateId === tpl.id && templateDraft ? (
                    <>
                      <DraftFields
                        draft={templateDraft}
                        onChange={setTemplateDraft}
                        clientNames={clientNames}
                        locale={locale}
                        dateLabel={t("recurring_next_date_label")}
                      />
                      {templateError && <p className="text-xs text-fleet-coral-text">{templateError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTemplateId(null);
                            setTemplateDraft(null);
                            setTemplateError(null);
                          }}
                          className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}
                        >
                          {t("close_word")}
                        </button>
                        <button
                          type="button"
                          disabled={savingTemplateId === tpl.id}
                          onClick={() => saveTemplate(tpl.id)}
                          className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
                        >
                          {savingTemplateId === tpl.id ? t("saving_word") : t("save_word")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-fleet-navy">
                          {tpl.description}
                          {!tpl.active && <span className="ms-1.5 text-xs font-bold text-fleet-coral-text">· {t("recurring_stopped_badge")}</span>}
                        </div>
                        <div className="text-xs text-fleet-ink">
                          {formatCurrency(tpl.amount)} ·{" "}
                          {tpl.active ? <span dir="ltr">{formatDateDisplay(tpl.next_due_date)}</span> : t("recurring_stopped_hint")}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTemplateId(tpl.id);
                            setTemplateDraft(draftFromTemplate(tpl, tpl.next_due_date));
                          }}
                          aria-label="edit"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-fleet-border text-fleet-ink hover:bg-fleet-paper"
                        >
                          <Pencil size={14} />
                        </button>
                        {tpl.active ? (
                          <button
                            type="button"
                            onClick={() => setStoppingId(tpl.id)}
                            aria-label={t("recurring_stop")}
                            title={t("recurring_stop")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-fleet-border text-fleet-coral-text hover:bg-fleet-paper"
                          >
                            <Ban size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === tpl.id}
                            onClick={() => resumeTemplate(tpl.id)}
                            aria-label={t("recurring_resume")}
                            title={t("recurring_resume")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-fleet-border text-fleet-moss-text hover:bg-fleet-paper disabled:opacity-60"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeletingId(tpl.id)}
                          aria-label={t("delete_word")}
                          title={t("delete_word")}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-fleet-border text-fleet-ink hover:bg-fleet-paper"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {stoppingId && (
        <ConfirmPopup message={t("recurring_stop_confirm")} onConfirm={() => stopTemplate(stoppingId)} onCancel={() => setStoppingId(null)} locale={locale} />
      )}
      {deletingId && (
        <ConfirmPopup message={t("recurring_delete_confirm")} onConfirm={() => deleteTemplate(deletingId)} onCancel={() => setDeletingId(null)} locale={locale} />
      )}
    </div>
  );
}
