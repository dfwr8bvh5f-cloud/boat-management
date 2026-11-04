import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCategoryLabels, getExpenseCategories, isSeparateBudgetCategory } from "@/lib/labels";
import { BudgetFigures, BudgetColumnHeader, BUDGET_ROW_GRID } from "@/components/budget-figures";
import { BudgetCategoryCard } from "@/components/budget-category-card";
import { BudgetPrintDocument, type BudgetPrintRow } from "@/components/budget-print-document";
import { PrintButton } from "@/components/print-button";
import { getTranslator } from "@/lib/i18n/locale";
import type { ExpenseCategory } from "@/lib/types/database";

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile } = await getBoatContext(id);
  const canEdit = profile.role === "management";
  const thisYear = new Date().getFullYear().toString();
  const { t, locale } = await getTranslator();
  const categoryLabels = getCategoryLabels(locale);
  const allCategories = getExpenseCategories(boat.boat_type, boat.name, locale);
  // Categories with their own budget (see SEPARATE_BUDGET_CATEGORIES) get a
  // separate section below and never count toward the annual totals.
  const categories = allCategories.filter((c) => !isSeparateBudgetCategory(c));
  const separateCategories = allCategories.filter((c) => isSeparateBudgetCategory(c));

  const supabase = await createClient();
  const [{ data: flatBudgets }, { data: subcategories }, allApprovedExpenses, separateExpenses] = await Promise.all([
    supabase.from("budget_categories").select("*").eq("boat_id", boat.id),
    supabase.from("budget_subcategories").select("*").eq("boat_id", boat.id).order("created_at"),
    fetchAllRows<{ category: ExpenseCategory | null; amount: number }>((from, to) =>
      supabase
        .from("expenses")
        .select("category, amount")
        .eq("boat_id", boat.id)
        .eq("status", "approved")
        .gte("expense_date", `${thisYear}-01-01`)
        .lte("expense_date", `${thisYear}-12-31`)
        .is("parent_expense_id", null)
        .is("archived_at", null)
        .range(from, to)
    ),
    // A separate-budget category isn't tied to one calendar year - everything
    // ever spent in it counts against its own budget.
    separateCategories.length > 0
      ? fetchAllRows<{ category: ExpenseCategory | null; amount: number }>((from, to) =>
          supabase
            .from("expenses")
            .select("category, amount")
            .eq("boat_id", boat.id)
            .eq("status", "approved")
            .in("category", separateCategories)
            .is("parent_expense_id", null)
            .is("archived_at", null)
            .range(from, to)
        )
      : Promise.resolve([] as { category: ExpenseCategory | null; amount: number }[]),
  ]);
  const approvedExpenses = allApprovedExpenses.filter((e) => !isSeparateBudgetCategory(e.category));

  const flatByCategory = new Map((flatBudgets ?? []).map((b) => [b.category, b.amount]));
  const subByCategory = new Map<string, typeof subcategories>();
  for (const sc of subcategories ?? []) {
    const list = subByCategory.get(sc.category) ?? [];
    list.push(sc);
    subByCategory.set(sc.category, list);
  }
  // An expense with no category yet still counts toward what's actually
  // been spent - it just can't be attributed to one of the per-category
  // cards below, since there's no category to attribute it to.
  const spentByCategory = new Map<string, number>();
  for (const e of approvedExpenses) {
    if (!e.category) continue;
    spentByCategory.set(e.category, (spentByCategory.get(e.category) ?? 0) + e.amount);
  }

  const totalSpent = approvedExpenses.reduce((s, e) => s + e.amount, 0);
  const totalBudget = categories.reduce((sum, key) => {
    const subs = subByCategory.get(key);
    const value = subs && subs.length > 0 ? subs.reduce((s, sc) => s + sc.amount, 0) : flatByCategory.get(key) ?? 0;
    return sum + value;
  }, 0);
  const budgetOf = (key: ExpenseCategory) => {
    const subs = subByCategory.get(key);
    return subs && subs.length > 0 ? subs.reduce((s, sc) => s + sc.amount, 0) : flatByCategory.get(key) ?? 0;
  };
  const toPrintRow = (key: ExpenseCategory, spent: number): BudgetPrintRow => ({
    label: categoryLabels[key],
    budget: budgetOf(key),
    spent,
    lines: (subByCategory.get(key) ?? []).map((sc) => ({ name: sc.name, amount: sc.amount })),
  });
  const annualPrintRows = categories
    .map((key) => toPrintRow(key, spentByCategory.get(key) ?? 0))
    .filter((r) => r.budget > 0 || r.spent > 0);
  const separatePrintRows = separateCategories.map((key) =>
    toPrintRow(key, separateExpenses.filter((e) => e.category === key).reduce((s, e) => s + e.amount, 0))
  );
  const boatLogoUrl = boat.logo_path ? supabase.storage.from("boat-photos").getPublicUrl(boat.logo_path).data.publicUrl : null;

  return (
    <>
    <div className="flex flex-col gap-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("sub_budget")}</h1>
        <PrintButton locale={locale} />
      </div>
      <div className="rounded-xl bg-fleet-navy p-3 text-white sm:p-4">
        <div className={BUDGET_ROW_GRID}>
          <div className="col-span-4 text-sm font-bold sm:col-span-1">{t("budget_word_annual")}</div>
          <BudgetFigures budgeted={totalBudget} spent={totalSpent} locale={locale} tone="dark" labels="always" />
        </div>
      </div>

      {separateCategories.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="text-sm font-bold text-fleet-ink">
            {t("budget_separate_title")}
          </div>
          <BudgetColumnHeader locale={locale} />
          {separateCategories.map((key) => (
            <BudgetCategoryCard
              key={key}
              boatId={boat.id}
              category={key}
              label={categoryLabels[key]}
              flatAmount={flatByCategory.get(key) ?? 0}
              subcategories={subByCategory.get(key) ?? []}
              spent={separateExpenses.filter((e) => e.category === key).reduce((s, e) => s + e.amount, 0)}
              canEdit={canEdit}
              locale={locale}
              hideRate
            />
          ))}
        </div>
      )}

      <div className="text-sm font-bold text-fleet-ink">{t("budget_by_category")}</div>
      <div className="flex flex-col gap-2.5">
        <BudgetColumnHeader locale={locale} />
        {categories.map((key) => (
          <BudgetCategoryCard
            key={key}
            boatId={boat.id}
            category={key}
            label={categoryLabels[key]}
            flatAmount={flatByCategory.get(key) ?? 0}
            subcategories={subByCategory.get(key) ?? []}
            spent={spentByCategory.get(key) ?? 0}
            canEdit={canEdit}
            locale={locale}
          />
        ))}
      </div>
    </div>
    <BudgetPrintDocument
      boatName={boat.name}
      boatLogoUrl={boatLogoUrl}
      year={thisYear}
      annual={annualPrintRows}
      annualTotalBudget={totalBudget}
      annualTotalSpent={totalSpent}
      separate={separatePrintRows}
      locale={locale}
    />
    </>
  );
}
