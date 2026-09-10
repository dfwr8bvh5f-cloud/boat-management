"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, ChevronDown, ChevronUp, Pencil, Plus, Repeat, RotateCcw, Trash2 } from "lucide-react";
import {
  confirmRecurringExpense,
  deleteRecurringExpenseTemplate,
  setRecurringExpenseTemplateActive,
  updateRecurringExpenseTemplate,
} from "@/lib/actions/recurring-expenses";
import { ConfirmPopup } from "@/components/confirm-popup";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { getCategoryLabels, getExpenseCategories, getPaymentLabels, PAYMENT_METHODS } from "@/lib/labels";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatType, ExpenseCategory, PaidByType, PaymentMethod, RecurringExpenseTemplate } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

type Draft = {
  description: string;
  invoiceNumber: string;
  amount: string;
  category: ExpenseCategory | "";
  paymentMethod: PaymentMethod | "";
  date: string;
  notes: string;
  isWarranty: boolean;
  paidBy: PaidByType;
};

function draftFromTemplate(tpl: RecurringExpenseTemplate, date: string): Draft {
  return {
    description: tpl.description,
    invoiceNumber: tpl.invoice_number ?? "",
    amount: String(tpl.amount),
    category: tpl.category ?? "",
    paymentMethod: tpl.payment_method ?? "",
    date,
    notes: tpl.notes ?? "",
    isWarranty: tpl.is_warranty,
    paidBy: tpl.paid_by,
  };
}

function draftToFormData(draft: Draft, dateFieldName: "expense_date" | "next_due_date"): FormData {
  const fd = new FormData();
  fd.set("description", draft.description);
  fd.set("invoice_number", draft.invoiceNumber);
  fd.set("amount", draft.amount);
  fd.set("category", draft.category);
  fd.set("payment_method", draft.paymentMethod);
  fd.set("paid_by", draft.paidBy);
  fd.set(dateFieldName, draft.date);
  fd.set("notes", draft.notes);
  if (draft.isWarranty) fd.set("is_warranty", "on");
  return fd;
}

// Shared editable field set for a due-suggestion's "edit before adding" form
// and for editing an already-scheduled template - same fields either way,
// just a different date label/name (expense_date for confirming an
// occurrence, next_due_date for rescheduling the template itself).
function DraftFields({
  draft,
  onChange,
  boatType,
  boatName,
  locale,
  dateLabel,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  boatType: BoatType;
  boatName: string;
  locale: Locale;
  dateLabel: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const categories = getExpenseCategories(boatType, boatName, locale);
  const categoryLabels = getCategoryLabels(locale);
  const paymentLabels = getPaymentLabels(locale);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("description")}</label>
        <input
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
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
          <label className="text-xs text-fleet-ink">{t("category")}</label>
          <CustomSelect
            value={draft.category}
            onChange={(v) => onChange({ ...draft, category: v as ExpenseCategory | "" })}
            options={[{ value: "", label: t("not_set_yet") }, ...categories.map((k) => ({ value: k, label: categoryLabels[k] }))]}
            className={INPUT_CLASS}
          />
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
        <input
          value={draft.invoiceNumber}
          onChange={(e) => onChange({ ...draft, invoiceNumber: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
        <textarea
          rows={2}
          value={draft.notes}
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>
    </div>
  );
}

// The due-suggestions banner (templates whose next_due_date has arrived)
// plus a collapsible list for managing every recurring template (upcoming
// and stopped) - shown above the normal expense form, see
// expenses-manager.tsx. Recurring templates themselves are created from
// that form's own "recurring expense" checkbox (createExpense,
// src/lib/actions/expenses.ts), not here.
export function RecurringExpensesPanel({
  boatId,
  boatType,
  boatName,
  templates,
  canAdd,
  locale,
}: {
  boatId: string;
  boatType: BoatType;
  boatName: string;
  templates: RecurringExpenseTemplate[];
  canAdd: boolean;
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

  const confirmDue = async (tpl: RecurringExpenseTemplate, draft: Draft) => {
    setConfirmError(null);
    setConfirmingId(tpl.id);
    try {
      await confirmRecurringExpense(boatId, tpl.id, draftToFormData(draft, "expense_date"));
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
      await setRecurringExpenseTemplateActive(boatId, templateId, false);
      router.refresh();
    } finally {
      setBusyId(null);
      setStoppingId(null);
    }
  };

  const resumeTemplate = async (templateId: string) => {
    setBusyId(templateId);
    try {
      await setRecurringExpenseTemplateActive(boatId, templateId, true);
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
      await updateRecurringExpenseTemplate(boatId, templateId, draftToFormData(templateDraft, "next_due_date"));
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
      await deleteRecurringExpenseTemplate(boatId, templateId);
      router.refresh();
    } finally {
      setBusyId(null);
      setDeletingId(null);
    }
  };

  // Managing a recurring template needs the exact same permission as adding
  // an expense in the first place (RLS matches: management everywhere,
  // captain on their own boat, no owner access) - a read-only viewer never
  // sees this panel at all rather than seeing disabled/failing controls.
  if (!canAdd || templates.length === 0) return null;

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
                    <DraftFields draft={dueDraft} onChange={setDueDraft} boatType={boatType} boatName={boatName} locale={locale} dateLabel={t("date")} />
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
                  <>
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
                  </>
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
                        boatType={boatType}
                        boatName={boatName}
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
                          {tpl.active ? (
                            <span dir="ltr">{formatDateDisplay(tpl.next_due_date)}</span>
                          ) : (
                            t("recurring_stopped_hint")
                          )}
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
        <ConfirmPopup
          message={t("recurring_stop_confirm")}
          onConfirm={() => stopTemplate(stoppingId)}
          onCancel={() => setStoppingId(null)}
          locale={locale}
        />
      )}
      {deletingId && (
        <ConfirmPopup
          message={t("recurring_delete_confirm")}
          onConfirm={() => deleteTemplate(deletingId)}
          onCancel={() => setDeletingId(null)}
          locale={locale}
        />
      )}
    </div>
  );
}
