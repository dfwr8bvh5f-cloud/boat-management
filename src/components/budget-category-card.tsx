"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { setCategoryBudget, addBudgetSubcategory, updateBudgetSubcategory, removeBudgetSubcategory } from "@/lib/actions/budget";
import { RippleLoader } from "@/components/ripple-loader";
import { Button } from "@/components/ui/button";
import { BudgetFigures, BUDGET_ROW_GRID } from "@/components/budget-figures";
import { BudgetSubcategoryForm } from "@/components/budget-subcategory-form";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BudgetSubcategory, ExpenseCategory } from "@/lib/types/database";

type TranslateKey = Parameters<typeof translate>[1];

// One budget line inside an open category: read-only row with edit/delete
// icons, which swaps in place for the edit form or the delete confirmation.
function SubcategoryRow({
  boatId,
  sc,
  canEdit,
  hideRate,
  locale,
}: {
  boatId: string;
  sc: BudgetSubcategory;
  canEdit: boolean;
  hideRate: boolean;
  locale: Locale;
}) {
  const t = (key: TranslateKey) => translate(locale, key);
  const [state, setState] = useState<"view" | "edit" | "delete">("view");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  if (state === "edit") {
    return (
      <BudgetSubcategoryForm
        initial={sc}
        hideRate={hideRate}
        submitLabel={t("save_word")}
        locale={locale}
        onCancel={() => setState("view")}
        onSubmit={async (formData) => {
          await updateBudgetSubcategory(boatId, sc.id, formData);
          setState("view");
        }}
      />
    );
  }

  if (state === "delete") {
    return (
      <div role="alertdialog" aria-label={sc.name} className="flex flex-col gap-2 rounded-lg border border-fleet-coral bg-fleet-paper p-3">
        <p className="text-xs font-semibold text-fleet-navy">{translate(locale, "subcat_delete_confirm", { name: sc.name })}</p>
        {deleteError && (
          <p role="alert" className="text-2xs font-semibold text-fleet-coral-text">
            {t("error_subcat_save_failed")}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="compact"
            loading={deleting}
            onClick={async () => {
              setDeleting(true);
              setDeleteError(false);
              try {
                await removeBudgetSubcategory(boatId, sc.id);
              } catch (err) {
                console.error("Budget subcategory delete failed", err);
                setDeleteError(true);
                setDeleting(false);
              }
            }}
          >
            {t("delete_word")}
          </Button>
          <Button variant="secondary" size="compact" disabled={deleting} onClick={() => setState("view")}>
            {t("cancel_word")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="min-w-0">
        {sc.name}
        {sc.rate != null && sc.duration != null && (
          <span className="text-fleet-ink">
            {" "}
            <bdi dir="ltr">
              ({formatCurrency(sc.rate)} × {sc.duration.toLocaleString("he-IL")}
              {sc.duration_unit ? ` ${sc.duration_unit}` : ""})
            </bdi>
          </span>
        )}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <span dir="ltr" className="tabular-nums">
          {formatCurrency(sc.amount)}
        </span>
        {canEdit && (
          <>
            <Button
              variant="text"
              size="compact"
              iconOnly
              aria-label={t("edit_subcat_label")}
              title={t("edit_subcat_label")}
              className="text-fleet-ink"
              onClick={() => setState("edit")}
            >
              <Pencil size={14} />
            </Button>
            <Button
              variant="text"
              size="compact"
              iconOnly
              aria-label={t("delete_subcat_label")}
              title={t("delete_subcat_label")}
              className="text-fleet-coral-text"
              onClick={() => setState("delete")}
            >
              <Trash2 size={14} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function BudgetCategoryCard({
  boatId,
  category,
  label,
  flatAmount,
  subcategories,
  spent,
  canEdit,
  locale,
  hideRate = false,
}: {
  boatId: string;
  category: ExpenseCategory;
  label: string;
  flatAmount: number;
  subcategories: BudgetSubcategory[];
  spent: number;
  canEdit: boolean;
  locale: Locale;
  // Simple lines only (name + amount) - hides the rate x quantity option.
  hideRate?: boolean;
}) {
  const t = (key: TranslateKey) => translate(locale, key);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [savedBudget, setSavedBudget] = useState(false);
  const hasSub = subcategories.length > 0;
  const budgeted = hasSub ? subcategories.reduce((s, sc) => s + sc.amount, 0) : flatAmount;
  const panelId = `budget-panel-${category}`;

  return (
    <div className="rounded-xl border border-fleet-border bg-white p-3 sm:p-4">
      <div className={BUDGET_ROW_GRID}>
        <div className="col-span-4 flex min-w-0 items-center gap-2 sm:col-span-1">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex min-w-0 items-center gap-1.5 text-start text-sm font-bold text-fleet-navy"
          >
            <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
            <span className="break-words">{label}</span>
          </button>
          {/* Opens this category's expenses (expenses page, category filter on) in a new tab. */}
          <a
            href={`/boats/${boatId}/finance/expenses?category=${category}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${t("budget_view_expenses")}: ${label}`}
            title={t("budget_view_expenses")}
            className="shrink-0 rounded p-1 text-fleet-ink hover:text-fleet-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40"
          >
            <ExternalLink size={13} />
          </a>
        </div>
        <BudgetFigures budgeted={budgeted} spent={spent} locale={locale} />
      </div>

      {open && (
        <div id={panelId} className="mt-3 border-t border-dashed border-fleet-border pt-3">
          {canEdit && !hasSub && (
            <form
              action={async (formData) => {
                setSavingBudget(true);
                await setCategoryBudget(boatId, category, formData);
                setSavingBudget(false);
                setSavedBudget(true);
                setTimeout(() => setSavedBudget(false), 1500);
              }}
              className="mb-3 flex items-center gap-2"
            >
              <label htmlFor={`${panelId}-amount`} className="text-xs text-fleet-ink">
                {t("subcat_category_total")}
              </label>
              <input
                id={`${panelId}-amount`}
                type="number"
                name="amount"
                step="0.01"
                defaultValue={flatAmount || ""}
                placeholder="0"
                onWheel={(e) => e.currentTarget.blur()}
                className="w-24 rounded-md border border-fleet-border px-1.5 py-1 text-center text-xs"
              />
              <Button type="submit" variant="text" size="compact" className="px-0 py-0" disabled={savingBudget || savedBudget}>
                {savingBudget ? (
                  <RippleLoader size="sm" />
                ) : savedBudget ? (
                  <CheckCircle2 size={14} className="animate-pop-in text-fleet-moss-text" />
                ) : (
                  t("update_word")
                )}
              </Button>
            </form>
          )}

          {!hasSub ? (
            <p className="mb-2 text-xs text-fleet-ink">{t("budget_no_subcats")}</p>
          ) : (
            <div className="mb-2 flex flex-col gap-1">
              {subcategories.map((sc) => (
                <SubcategoryRow key={sc.id} boatId={boatId} sc={sc} canEdit={canEdit} hideRate={hideRate} locale={locale} />
              ))}
            </div>
          )}

          {canEdit &&
            (adding ? (
              <BudgetSubcategoryForm
                hideRate={hideRate}
                submitLabel={t("add_subcat_button")}
                locale={locale}
                onCancel={() => setAdding(false)}
                onSubmit={async (formData) => {
                  await addBudgetSubcategory(boatId, category, formData);
                  setAdding(false);
                }}
              />
            ) : (
              <Button variant="secondary" size="compact" onClick={() => setAdding(true)}>
                <Plus size={14} />
                {t("add_subcat_button")}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
