import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, Receipt, TrendingUp } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMysExpenseCategoryLabels, MYS_EXPENSE_CATEGORY_COLORS } from "@/lib/labels";
import { CategoryPieChart } from "@/components/report-charts-lazy";
import { ReportKpiCard } from "@/components/report-kpi-card";
import { getTranslator } from "@/lib/i18n/locale";
import { todayLocalISO } from "@/lib/date-format";
import { formatCurrency } from "@/lib/money";
import type { MysExpenseCategory } from "@/lib/types/database";

export default async function MysDashboardPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { t, locale } = await getTranslator();
  const categoryLabels = getMysExpenseCategoryLabels(locale);

  const today = todayLocalISO();
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);
  // An exclusive upper bound at the first day of next month - not every
  // month has 31 days, so ".lte(..., `${thisMonth}-31`)" would ask Postgres
  // to cast an invalid date for April/June/September/November (the exact
  // bug already fixed on the Invoices page - same reasoning applies here).
  const [monthYear, monthNum] = thisMonth.split("-").map(Number);
  const firstOfNextMonth =
    monthNum === 12 ? `${monthYear + 1}-01-01` : `${monthYear}-${String(monthNum + 1).padStart(2, "0")}-01`;

  const supabase = await createClient();

  const [
    { data: expensesThisYear },
    { data: incomeThisYear },
    { data: chargeDebts },
    { data: adHocDebts },
    { data: invoiceDebts },
  ] = await Promise.all([
    supabase.from("mys_expenses").select("amount, category, expense_date").gte("expense_date", `${thisYear}-01-01`).lte("expense_date", `${thisYear}-12-31`),
    supabase.from("mys_income").select("amount, income_date").gte("income_date", `${thisYear}-01-01`).lte("income_date", `${thisYear}-12-31`),
    supabase
      .from("expenses")
      .select("amount")
      .eq("paid_by", "management")
      .eq("is_payment_plan", false)
      .eq("status", "approved")
      .is("mys_charge_settled_at", null),
    supabase.from("mys_ad_hoc_charges").select("amount").eq("status", "unpaid"),
    supabase.from("mys_invoices").select("amount").eq("status", "sent"),
  ]);

  const sum = (rows: { amount: number }[] | null) => (rows ?? []).reduce((s, r) => s + r.amount, 0);

  const expensesThisMonthTotal = sum((expensesThisYear ?? []).filter((e) => e.expense_date >= thisMonth && e.expense_date < firstOfNextMonth));
  const expensesThisYearTotal = sum(expensesThisYear);
  const incomeThisMonthTotal = sum((incomeThisYear ?? []).filter((i) => i.income_date >= thisMonth && i.income_date < firstOfNextMonth));
  const incomeThisYearTotal = sum(incomeThisYear);
  const outstandingDebtsTotal = sum(chargeDebts) + sum(adHocDebts) + sum(invoiceDebts);

  const byCategory = new Map<MysExpenseCategory, number>();
  for (const e of expensesThisYear ?? []) {
    const cat = e.category as MysExpenseCategory;
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + e.amount);
  }
  const pieData = [...byCategory.entries()]
    .filter(([, value]) => value > 0)
    .map(([category, value]) => ({ name: categoryLabels[category], value, color: MYS_EXPENSE_CATEGORY_COLORS[category] }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mys_dashboard_title")}</h1>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/mys/expenses"
          className="flex items-center gap-1.5 rounded-full border border-fleet-border bg-white px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
        >
          <Receipt size={14} /> {t("mys_expenses_title")}
        </Link>
        <Link
          href="/mys/income"
          className="flex items-center gap-1.5 rounded-full border border-fleet-border bg-white px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
        >
          <TrendingUp size={14} /> {t("mys_income_title")}
        </Link>
        <Link
          href="/mys/debts"
          className="flex items-center gap-1.5 rounded-full border border-fleet-border bg-white px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
        >
          <AlertCircle size={14} /> {t("mys_outstanding_debts")}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <ReportKpiCard label={t("mys_income_month")} value={formatCurrency(incomeThisMonthTotal)} tone="positive" />
        <ReportKpiCard label={t("mys_income_year")} value={formatCurrency(incomeThisYearTotal)} tone="positive" />
        <ReportKpiCard label={t("mys_expenses_month")} value={formatCurrency(expensesThisMonthTotal)} tone="negative" />
        <ReportKpiCard label={t("mys_expenses_year")} value={formatCurrency(expensesThisYearTotal)} tone="negative" />
        <ReportKpiCard label={t("mys_outstanding_debts")} value={formatCurrency(outstandingDebtsTotal)} tone="neutral" />
      </div>

      {pieData.length > 0 && (
        <div className="rounded-xl border border-fleet-border bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-4 text-sm font-bold text-fleet-navy">{t("mys_expenses_by_category")}</h2>
          <CategoryPieChart data={pieData} />
        </div>
      )}
    </div>
  );
}
