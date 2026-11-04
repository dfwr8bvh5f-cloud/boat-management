import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCategoryLabels, getExpenseCategories, budgetColor, isSeparateBudgetCategory } from "@/lib/labels";
import { BudgetCategoryCard } from "@/components/budget-category-card";
import { getTranslator } from "@/lib/i18n/locale";
import type { ExpenseCategory } from "@/lib/types/database";
import { formatCurrency } from "@/lib/money";

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
  // Shown to her uncapped - going over budget should read as e.g. 140%, not
  // silently sit at 100%. Only the bar's own fill width gets clamped below.
  const totalPct = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("sub_budget")}</h1>
      <div className="rounded-xl bg-fleet-navy p-4 text-white">
        <div className="text-xs opacity-80">{t("budget_word_annual")}</div>
        <div className="mt-1 text-2xl font-bold">
          <span className="text-sm font-normal opacity-75">{t("budget_spent_word")} </span>
          <span dir="ltr">{formatCurrency(totalSpent)}</span>{" "}
          <span className="text-sm font-normal opacity-75">
            · {t("budget_planned_word")} <span dir="ltr">{formatCurrency(totalBudget)}</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full"
            style={{
              width: `${Math.min(100, totalPct)}%`,
              backgroundColor: budgetColor(totalPct),
            }}
          />
        </div>
        {totalBudget > 0 && (
          <div className="mt-1 text-2xs opacity-80">
            {totalPct}% {t("budget_used_pct")}
          </div>
        )}
      </div>

      {separateCategories.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="text-sm font-bold text-fleet-ink">
            {t("budget_separate_title")} <span className="text-xs font-normal text-fleet-ink">· {t("budget_separate_note")}</span>
          </div>
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
            />
          ))}
        </div>
      )}

      <div className="text-sm font-bold text-fleet-ink">{t("budget_by_category")}</div>
      <div className="flex flex-col gap-2.5">
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
  );
}
