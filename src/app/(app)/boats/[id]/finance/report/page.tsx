import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getCategoryLabels, getCategoryColors, getPaymentLabels, getExpenseCategories } from "@/lib/labels";
import { computeFinancialSnapshot } from "@/lib/report-data";
import { CategoryPieChart } from "@/components/category-pie-chart";
import { BudgetStatusTable } from "@/components/budget-status-table";
import { ReportActions } from "@/components/report-actions";
import { DateInput } from "@/components/date-input";
import { getTranslator } from "@/lib/i18n/locale";

function formatCurrency(n: number) {
  return `€${n.toLocaleString("he-IL")}`;
}

export default async function PeriodReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { boat, profile } = await getBoatContext(id);
  const { from: fromParam, to: toParam } = await searchParams;
  const { t, locale } = await getTranslator();
  const categoryLabels = getCategoryLabels(locale);
  const categoryColors = getCategoryColors();
  const paymentLabels = getPaymentLabels(locale);
  const categories = getExpenseCategories(boat.boat_type, boat.name);

  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const from = fromParam || firstOfMonth.toISOString().slice(0, 10);
  const to = toParam || new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const snapshot = await computeFinancialSnapshot(supabase, boat.id, from, to, categories);

  const categoryTotals = snapshot.byCategory.map((c) => ({
    category: c.category,
    label: categoryLabels[c.category],
    sum: c.sum,
    color: categoryColors[c.category],
  }));

  const budgetRows = snapshot.budgetVsActual.map((b) => ({
    label: categoryLabels[b.category],
    budget: b.budget,
    spentYtd: b.spentYtd,
  }));

  const csvRows = snapshot.expenseList.map((e) => ({
    date: e.date,
    description: e.description,
    category: categoryLabels[e.category],
    paidWith: e.paymentMethod ? paymentLabels[e.paymentMethod] : "",
    amount: e.amount,
  }));

  return (
    <div className="flex flex-col gap-4">
      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-xl border border-fleet-border bg-white p-4 print:hidden">
        <label className="flex flex-col gap-1 text-xs text-fleet-ink">
          {t("from_date")}
          <DateInput
            name="from"
            defaultValue={from}
            locale={locale}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fleet-ink">
          {t("to_date")}
          <DateInput
            name="to"
            defaultValue={to}
            locale={locale}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal"
          />
        </label>
        <button type="submit" className="rounded-lg bg-fleet-teal px-4 py-2 text-sm font-bold text-white">
          {t("report_show")}
        </button>
      </form>

      <ReportActions
        boatId={boat.id}
        from={from}
        to={to}
        csvRows={csvRows}
        isManagement={profile.role === "management"}
        locale={locale}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-fleet-border bg-white p-4">
            <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <div className="text-fleet-ink">{t("from_date")}</div>
              <div className="font-medium" dir="ltr">{from}</div>
              <div className="text-fleet-ink">{t("to_date")}</div>
              <div className="font-medium" dir="ltr">{to}</div>
              <div className="text-fleet-ink">{t("report_bank_balance")}</div>
              <div className="font-medium">{formatCurrency(snapshot.bankBalance)}</div>
              <div className="text-fleet-ink">{t("report_cash_balance")}</div>
              <div className="font-medium">{formatCurrency(snapshot.cashBalance)}</div>
              <div className="font-bold text-fleet-navy">{t("report_total_balance")}</div>
              <div className="font-bold text-fleet-navy">{formatCurrency(snapshot.bankBalance + snapshot.cashBalance)}</div>
              <div className="font-bold text-fleet-coral">{t("report_total_period_expenses")}</div>
              <div className="font-bold text-fleet-coral">{formatCurrency(snapshot.totalExpenses)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-fleet-border bg-white p-4">
            <div className="mb-2 text-xs font-bold text-fleet-ink">{t("report_expense_list_title")}</div>
            {snapshot.expenseList.length === 0 ? (
              <p className="text-sm text-fleet-ink">{t("none_reports")}</p>
            ) : (
              <div className="max-h-[32rem] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-fleet-border text-fleet-ink">
                      <th className="py-1.5 pe-2 text-start font-semibold">{t("date")}</th>
                      <th className="py-1.5 pe-2 text-start font-semibold">{t("description")}</th>
                      <th className="py-1.5 pe-2 text-start font-semibold">{t("report_type_of_expense")}</th>
                      <th className="py-1.5 pe-2 text-start font-semibold">{t("report_paid_with")}</th>
                      <th className="py-1.5 text-end font-semibold">{t("amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.expenseList.map((e, idx) => (
                      <tr key={idx} className="border-b border-dotted border-fleet-border">
                        <td className="py-1.5 pe-2 whitespace-nowrap" dir="ltr">{e.date}</td>
                        <td className="py-1.5 pe-2">{e.description}</td>
                        <td className="py-1.5 pe-2 whitespace-nowrap">{categoryLabels[e.category]}</td>
                        <td className="py-1.5 pe-2 whitespace-nowrap">{e.paymentMethod ? paymentLabels[e.paymentMethod] : "—"}</td>
                        <td className="py-1.5 text-end whitespace-nowrap">{formatCurrency(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {categoryTotals.length > 0 && (
            <div className="rounded-xl border border-fleet-border bg-white p-4">
              <div className="mb-2 text-xs font-bold text-fleet-ink">{t("report_period_totals_title")}</div>
              <CategoryPieChart data={categoryTotals.map((c) => ({ name: c.label, value: c.sum, color: c.color }))} />
              <div className="mt-2 flex flex-col gap-1">
                {categoryTotals.map((c) => (
                  <div key={c.category} className="flex items-center justify-between border-b border-dotted border-fleet-border py-1.5 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                      {c.label}
                    </span>
                    <span className="font-medium">{formatCurrency(c.sum)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-fleet-border bg-white p-4">
            <div className="mb-2 text-xs font-bold text-fleet-ink">{t("report_budget_status_title")}</div>
            <BudgetStatusTable
              rows={budgetRows}
              totalBudget={snapshot.totalAnnualBudget}
              totalSpent={snapshot.totalSpentYtd}
              labels={{
                type: t("report_type_of_expense"),
                pct: t("report_pct_spent_col"),
                budget: t("report_annual_budget_col"),
                ytd: t("report_ytd_expenses_col"),
                total: t("report_total_row"),
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
