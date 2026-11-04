import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCategoryLabels, getExpenseCategories, isSeparateBudgetCategory, SEPARATE_BUDGET_YEAR } from "@/lib/labels";
import Link from "next/link";
import { BudgetFigures, BudgetColumnHeader, BUDGET_ROW_GRID } from "@/components/budget-figures";
import { BudgetCopyButton } from "@/components/budget-copy-button";
import { BudgetCategoryCard } from "@/components/budget-category-card";
import { BudgetPrintDocument, type BudgetPrintRow } from "@/components/budget-print-document";
import { PrintButton } from "@/components/print-button";
import { getTranslator } from "@/lib/i18n/locale";
import type { ExpenseCategory } from "@/lib/types/database";

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { id } = await params;
  const { year: yearParam } = await searchParams;
  const { boat, profile } = await getBoatContext(id);
  const canEdit = profile.role === "management";
  const currentYear = new Date().getFullYear();
  // ?year= picks the budget year; anything unusable falls back to this year.
  const requestedYear = Number(yearParam);
  const budgetYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100 ? requestedYear : currentYear;
  const thisYear = String(budgetYear);
  const { t, locale } = await getTranslator();
  const categoryLabels = getCategoryLabels(locale);
  const allCategories = getExpenseCategories(boat.boat_type, boat.name, locale);
  // Categories with their own budget (see SEPARATE_BUDGET_CATEGORIES) get a
  // separate section below and never count toward the annual totals.
  const categories = allCategories.filter((c) => !isSeparateBudgetCategory(c));
  const separateCategories = allCategories.filter((c) => isSeparateBudgetCategory(c));

  const supabase = await createClient();
  const [{ data: flatBudgets }, { data: subcategories }, { data: flatYears }, { data: subYears }, allApprovedExpenses, separateExpenses] = await Promise.all([
    // The selected year's rows, plus the year-less rows of any separate budget.
    supabase.from("budget_categories").select("*").eq("boat_id", boat.id).in("year", [budgetYear, SEPARATE_BUDGET_YEAR]),
    supabase.from("budget_subcategories").select("*").eq("boat_id", boat.id).in("year", [budgetYear, SEPARATE_BUDGET_YEAR]).order("created_at"),
    supabase.from("budget_categories").select("year").eq("boat_id", boat.id).gt("year", 0),
    supabase.from("budget_subcategories").select("year").eq("boat_id", boat.id).gt("year", 0),
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
  // Years to switch between: every year that has budget data, plus last year,
  // this year and next year (so next year's budget can be prepared early).
  const dataYears = new Set([...(flatYears ?? []), ...(subYears ?? [])].map((r) => r.year));
  const years = [...new Set([...dataYears, currentYear - 1, currentYear, currentYear + 1])].sort((a, b) => a - b);
  // Categories with no budget and no spend in this year are tucked into a
  // collapsed group (still editable there) so unused ones don't clutter the
  // list. If NOTHING has data yet (e.g. a freshly started year) show them all.
  const hasData = (key: ExpenseCategory) => budgetOf(key) > 0 || (spentByCategory.get(key) ?? 0) > 0;
  const anyData = categories.some(hasData);
  const visibleCategories = anyData ? categories.filter(hasData) : categories;
  const unusedCategories = anyData ? categories.filter((k) => !hasData(k)) : [];
  const renderCard = (key: ExpenseCategory) => (
    <BudgetCategoryCard
      key={key}
      boatId={boat.id}
      year={budgetYear}
      category={key}
      label={categoryLabels[key]}
      flatAmount={flatByCategory.get(key) ?? 0}
      subcategories={subByCategory.get(key) ?? []}
      spent={spentByCategory.get(key) ?? 0}
      canEdit={canEdit}
      locale={locale}
    />
  );
  const boatLogoUrl = boat.logo_path ? supabase.storage.from("boat-photos").getPublicUrl(boat.logo_path).data.publicUrl : null;

  return (
    <>
    <div className="flex flex-col gap-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">
          {t("sub_budget")} {budgetYear}
        </h1>
        <PrintButton locale={locale} />
      </div>
      <nav aria-label={t("budget_year_label")} className="flex flex-wrap gap-1.5">
        {years.map((y) => (
          <Link
            key={y}
            href={`/boats/${boat.id}/finance/budget?year=${y}`}
            aria-current={y === budgetYear ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40 ${
              y === budgetYear ? "border-fleet-navy bg-fleet-navy text-white" : "border-fleet-border bg-white text-fleet-ink hover:bg-fleet-paper"
            }`}
          >
            {y}
          </Link>
        ))}
      </nav>
      {canEdit && budgetYear !== SEPARATE_BUDGET_YEAR && !dataYears.has(budgetYear) && dataYears.has(budgetYear - 1) && (
        <BudgetCopyButton boatId={boat.id} toYear={budgetYear} locale={locale} />
      )}
      <div className="rounded-xl border border-transparent bg-fleet-navy p-3 text-white sm:p-4">
        <div className={BUDGET_ROW_GRID}>
          <div className="col-span-4 text-sm font-bold sm:col-span-1">{t("budget_word_annual")} {budgetYear}</div>
          <BudgetFigures budgeted={totalBudget} spent={totalSpent} locale={locale} tone="dark" labels="always" />
        </div>
      </div>

      {separateCategories.length > 0 && (
        <section className="mt-2 flex flex-col gap-2.5">
          <div className="text-sm font-bold text-fleet-ink">
            {t("budget_separate_title")}
          </div>
          <BudgetColumnHeader locale={locale} />
          {separateCategories.map((key) => (
            <BudgetCategoryCard
              key={key}
              boatId={boat.id}
              year={SEPARATE_BUDGET_YEAR}
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
        </section>
      )}

      <section className="mt-2 flex flex-col gap-2.5">
        <div className="text-sm font-bold text-fleet-ink">{t("budget_by_category")}</div>
        <BudgetColumnHeader locale={locale} />
        {visibleCategories.map(renderCard)}
        {unusedCategories.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none rounded-lg px-1 py-1.5 text-xs font-semibold text-fleet-ink hover:text-fleet-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40">
              {t("budget_unused_categories").replace("{count}", String(unusedCategories.length))}
            </summary>
            <div className="mt-2 flex flex-col gap-2.5">{unusedCategories.map(renderCard)}</div>
          </details>
        )}
      </section>
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
