import Image from "next/image";
import { Ship } from "lucide-react";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getCategoryLabels, getCategoryColors, getPaymentLabels, getExpenseCategories } from "@/lib/labels";
import { computeFinancialSnapshot } from "@/lib/report-data";
import { computeReportInsights } from "@/lib/report-insights";
import { CategoryPieChart, ReportBarChart } from "@/components/report-charts-lazy";
import { ReportKpiCard } from "@/components/report-kpi-card";
import { BudgetHealthBars } from "@/components/budget-health-bars";
import { BudgetStatusTable } from "@/components/budget-status-table";
import { ReportActions } from "@/components/report-actions";
import { ReportsManager } from "@/components/reports-manager";
import { DateInput } from "@/components/date-input";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { getTranslator } from "@/lib/i18n/locale";
import { formatCurrencySigned as formatCurrency } from "@/lib/money";

function budgetUsedTone(pct: number): "positive" | "neutral" | "negative" {
  if (pct > 100) return "negative";
  if (pct > 70) return "neutral";
  return "positive";
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

  const today = todayLocalISO();
  const from = fromParam || `${today.slice(0, 7)}-01`;
  const to = toParam || today;

  const supabase = await createClient();
  const [snapshot, { data: reports }] = await Promise.all([
    computeFinancialSnapshot(supabase, boat.id, from, to, categories),
    supabase.from("reports").select("*").eq("boat_id", boat.id).eq("type", "financial").order("issued_at", { ascending: false }),
  ]);

  const logoUrl: string | null = boat.logo_path ? supabase.storage.from("boat-photos").getPublicUrl(boat.logo_path).data.publicUrl : null;

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

  const topExpenses = [...snapshot.expenseList].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const insights = computeReportInsights(snapshot, from, to);
  const budgetUsedPct = snapshot.totalAnnualBudget > 0 ? Math.round((snapshot.totalSpentYtd / snapshot.totalAnnualBudget) * 100) : 0;

  const categoryComparisonData = budgetRows
    .filter((b) => b.budget > 0)
    .map((b) => ({ label: b.label, budget: b.budget, spent: b.spentYtd }));

  const issuerIds = [...new Set((reports ?? []).map((r) => r.issued_by).filter((v): v is string => Boolean(v)))];
  const { data: issuers } =
    issuerIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", issuerIds) : { data: [] };
  const issuerNames = Object.fromEntries((issuers ?? []).map((p) => [p.id, p.full_name ?? "—"]));

  const sectionTitleClass = "text-2xl font-semibold tracking-tight text-fleet-navy print:text-lg print:break-after-avoid";
  const cardClass = "rounded-xl border border-fleet-border bg-white p-6 sm:p-8 shadow-sm print:shadow-none print:p-4";

  return (
    <div className="flex flex-col gap-4" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
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

      <ReportActions boatId={boat.id} from={from} to={to} isManagement={profile.role === "management"} locale={locale} />

      <details className="rounded-xl border border-fleet-border bg-white p-4 print:hidden">
        <summary className="cursor-pointer text-sm font-bold text-fleet-navy">
          {t("issued_reports_title", { count: reports?.length ?? 0 })}
        </summary>
        <div className="mt-3">
          <ReportsManager
            boatId={boat.id}
            reports={reports ?? []}
            reportType="financial"
            issuerNames={issuerNames}
            isManagement={profile.role === "management"}
            locale={locale}
          />
        </div>
      </details>

      {/* ===== Page 1 ===== */}
      <div className="flex flex-col gap-8 print:gap-3">
        <div className={`${cardClass} print:break-inside-avoid`}>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="text-xs font-semibold tracking-[0.2em] text-fleet-brass uppercase">MYS FLEET</div>
              <h1 className="mt-1 font-brand text-4xl font-light text-fleet-navy print:text-2xl">{boat.name}</h1>
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1.5 text-sm print:mt-2">
                <div>
                  <span className="text-fleet-ink">{t("report_period_label")}: </span>
                  <span className="font-medium text-fleet-navy" dir="ltr">
                    {formatDateDisplay(from)} – {formatDateDisplay(to)}
                  </span>
                </div>
                <div>
                  <span className="text-fleet-ink">{t("report_generated_on")}: </span>
                  <span className="font-medium text-fleet-navy" dir="ltr">{formatDateDisplay(today)}</span>
                </div>
              </div>
            </div>
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-fleet-paper print:h-14 print:w-14">
              {logoUrl ? (
                <Image src={logoUrl} alt="" fill sizes="80px" className="object-contain" />
              ) : (
                <Ship size={32} className="text-fleet-brass" />
              )}
            </div>
          </div>
        </div>

        <section className="flex flex-col gap-4 print:gap-2">
          <h2 className={sectionTitleClass}>{t("report_section_executive_summary")}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-4 print:gap-2">
            <ReportKpiCard label={t("report_bank_balance")} value={formatCurrency(snapshot.bankBalance)} tone={snapshot.bankBalance >= 0 ? "positive" : "negative"} />
            <ReportKpiCard label={t("report_cash_balance")} value={formatCurrency(snapshot.cashBalance)} tone={snapshot.cashBalance >= 0 ? "positive" : "negative"} />
            <ReportKpiCard label={t("report_kpi_total_expenses")} value={formatCurrency(snapshot.totalExpenses)} />
            <ReportKpiCard
              label={t("report_kpi_budget_used")}
              value={`${budgetUsedPct}%`}
              subLabel={`${formatCurrency(snapshot.totalSpentYtd)} / ${formatCurrency(snapshot.totalAnnualBudget)}`}
              tone={budgetUsedTone(budgetUsedPct)}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4 print:gap-2">
          <h2 className={sectionTitleClass}>{t("report_section_overview")}</h2>

          {categoryTotals.length > 0 && (
            <div className={`${cardClass} print:break-inside-avoid`}>
              <div className="mb-6 text-sm font-semibold text-fleet-navy print:mb-2">{t("report_period_totals_title")}</div>
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-10 print:flex-row print:gap-4">
                <CategoryPieChart
                  data={categoryTotals.map((c) => ({ name: c.label, value: c.sum, color: c.color }))}
                  className="h-40 w-40 shrink-0"
                />
                <div className="flex w-full flex-col gap-1">
                  {categoryTotals.map((c) => (
                    <div key={c.category} className="flex items-center justify-between border-b border-dotted border-fleet-border py-2 text-sm print:py-1">
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                        {c.label}
                      </span>
                      <span className="font-medium text-fleet-navy">{formatCurrency(c.sum)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </section>

        {topExpenses.length > 0 && (
          <section className="flex flex-col gap-4 print:gap-2">
            <h2 className={sectionTitleClass}>{t("report_top_expenses_title")}</h2>
            <div className={`${cardClass} print:break-inside-avoid`}>
              <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-fleet-border text-xs font-semibold tracking-wide text-fleet-ink uppercase">
                    <th className="pb-3 pe-3 text-start print:pb-1.5">{t("description")}</th>
                    <th className="pb-3 pe-3 text-start print:pb-1.5">{t("report_type_of_expense")}</th>
                    <th className="pb-3 pe-3 text-start print:pb-1.5">{t("date")}</th>
                    <th className="pb-3 text-end print:pb-1.5">{t("amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {topExpenses.map((e, idx) => (
                    <tr key={idx} className="border-b border-fleet-border/60 last:border-b-0">
                      <td className="py-3 pe-3 print:py-1.5">{e.description}</td>
                      <td className="py-3 pe-3 text-fleet-ink print:py-1.5">{e.category ? categoryLabels[e.category] : t("not_set_yet")}</td>
                      <td className="py-3 pe-3 text-fleet-ink whitespace-nowrap print:py-1.5">
                        <span dir="ltr">{formatDateDisplay(e.date)}</span>
                      </td>
                      <td className="py-3 text-end font-semibold text-fleet-navy whitespace-nowrap print:py-1.5">{formatCurrency(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </section>
        )}

        {categoryComparisonData.length > 0 && (
          <section className="flex flex-col gap-4 print:gap-2">
            <h2 className={sectionTitleClass}>{t("report_budget_health_title")}</h2>
            <div className={`${cardClass} print:break-inside-avoid`}>
              <BudgetHealthBars rows={budgetRows} overBudgetLabel={t("report_over_budget_label")} />
            </div>
          </section>
        )}
      </div>

      {/* ===== Transactions ===== */}
      <div className="flex flex-col gap-4 print:mt-4">
        <h2 className={`${sectionTitleClass} mt-4`}>{t("report_transactions_title")}</h2>
        <div className={cardClass}>
          {snapshot.expenseList.length === 0 ? (
            <p className="text-sm text-fleet-ink">{t("report_no_data_period")}</p>
          ) : (
            <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full text-sm print:table-fixed print:text-3xs">
              <thead className="sticky top-0 z-10 bg-white print:static">
                <tr className="border-b-2 border-fleet-navy text-xs font-semibold tracking-wide text-fleet-ink uppercase">
                  <th className="py-3 pe-3 text-start print:w-[13%]">{t("date")}</th>
                  <th className="py-3 pe-3 text-start print:w-[35%]">{t("description")}</th>
                  <th className="py-3 pe-3 text-start print:w-[18%]">{t("report_type_of_expense")}</th>
                  <th className="py-3 pe-3 text-start print:w-[16%]">{t("report_paid_with")}</th>
                  <th className="py-3 text-end print:w-[18%]">{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.expenseList.map((e, idx) => (
                  <tr key={idx} className={`print:break-inside-avoid ${idx % 2 === 1 ? "bg-fleet-paper" : ""}`}>
                    <td className="py-3 pe-3 whitespace-nowrap">
                      <span dir="ltr">{formatDateDisplay(e.date)}</span>
                    </td>
                    <td className="py-3 pe-3 break-words">{e.description}</td>
                    <td className="py-3 pe-3 whitespace-nowrap break-words print:whitespace-normal">{e.category ? categoryLabels[e.category] : t("not_set_yet")}</td>
                    <td className="py-3 pe-3 whitespace-nowrap break-words print:whitespace-normal">{e.paymentMethod ? paymentLabels[e.paymentMethod] : "—"}</td>
                    <td className="py-3 text-end font-medium whitespace-nowrap">{formatCurrency(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* ===== Budget Analysis ===== */}
      <div className="flex flex-col gap-8 print:mt-4">
        <h2 className={`${sectionTitleClass} mt-4`}>{t("report_section_budget_analysis")}</h2>

        {categoryComparisonData.length > 0 && (
          <div className={`${cardClass} print:break-inside-avoid`}>
            <div className="mb-6 text-sm font-semibold text-fleet-navy">{t("report_category_comparison_title")}</div>
            <ReportBarChart
              data={categoryComparisonData}
              xKey="label"
              series={[
                { key: "budget", label: t("report_annual_budget_col"), color: "#c7ccd6" },
                { key: "spent", label: t("report_ytd_expenses_col"), color: "#0b1f38" },
              ]}
            />
          </div>
        )}

        <div className={cardClass}>
          <div className="mb-4 text-sm font-semibold text-fleet-navy">{t("report_budget_status_title")}</div>
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

        {insights.savingsOpportunities.length > 0 && (
          <div className={`${cardClass} print:break-inside-avoid`}>
            <div className="mb-4 text-sm font-semibold text-fleet-navy">{t("report_savings_opportunities_title")}</div>
            <div className="flex flex-col gap-3">
              {insights.savingsOpportunities.map((s) => (
                <div key={s.category} className="flex items-center justify-between text-sm">
                  <span className="text-fleet-navy">{categoryLabels[s.category]}</span>
                  <span className="font-semibold text-fleet-moss-text">
                    {t("report_remaining_word")}: {formatCurrency(s.remaining)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
