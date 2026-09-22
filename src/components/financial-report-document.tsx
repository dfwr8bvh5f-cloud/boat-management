import Image from "next/image";
import { Ship, ReceiptEuro } from "lucide-react";
import { CategoryPieChart } from "@/components/report-charts-lazy";
import { ReportKpiCard } from "@/components/report-kpi-card";
import { BudgetHealthBars } from "@/components/budget-health-bars";
import { formatDateDisplay } from "@/lib/date-format";
import { formatCurrencySigned as formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { ExpenseCategory, FinancialSnapshot, PaymentMethod } from "@/lib/types/database";

function budgetUsedTone(pct: number): "positive" | "neutral" | "negative" {
  if (pct > 100) return "negative";
  if (pct > 70) return "neutral";
  return "positive";
}

// The full presentational layout of a financial period report - shared by
// the live server-rendered page (finance/report/page.tsx) and, via a print
// portal, ReportsManager's saved-report print/download button. Kept purely
// presentational (props in, JSX out) so it drops into either a server
// component tree or a client component tree unchanged.
export function FinancialReportDocument({
  boatName,
  logoUrl,
  from,
  to,
  generatedOn,
  snapshot,
  categoryLabels,
  categoryColors,
  paymentLabels,
  receiptUrlByPath,
  locale,
}: {
  boatName: string;
  logoUrl: string | null;
  from: string;
  to: string;
  generatedOn: string;
  snapshot: FinancialSnapshot;
  categoryLabels: Record<ExpenseCategory, string>;
  categoryColors: Record<ExpenseCategory, string>;
  paymentLabels: Record<PaymentMethod, string>;
  // Omitted for a saved report printed from ReportsManager - the receipt
  // link column is print:hidden anyway (screen-only), so it never needs
  // signed URLs resolved for the printed output.
  receiptUrlByPath?: Map<string, string>;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const receiptUrls = receiptUrlByPath ?? new Map<string, string>();

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
  const budgetUsedPct = snapshot.totalAnnualBudget > 0 ? Math.round((snapshot.totalSpentYtd / snapshot.totalAnnualBudget) * 100) : 0;

  const categoryComparisonData = budgetRows
    .filter((b) => b.budget > 0)
    .map((b) => ({ label: b.label, budget: b.budget, spent: b.spentYtd }));

  const sectionTitleClass = "text-2xl font-semibold tracking-tight text-fleet-navy print:text-lg print:break-after-avoid";
  const cardClass = "rounded-xl border border-fleet-border bg-white p-6 sm:p-8 shadow-sm print:shadow-none print:p-4";

  return (
    // print:block (not flex) below - a forced page break on a section
    // further down (print:break-before-page) isn't reliably honored by the
    // browser's print engine when that section is a flex item, only when
    // it's a normal block-level child. Every section here already carries
    // its own print:mt-4/print:gap-3 top spacing rather than leaning on
    // this container's own gap, so switching away from flex for print
    // doesn't lose any spacing.
    <div className="flex flex-col gap-4 print:block" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
      {/* ===== Page 1 ===== */}
      <div className="flex flex-col gap-8 print:gap-3">
        <div className={`${cardClass} print:break-inside-avoid`}>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="text-xs font-semibold tracking-[0.2em] text-fleet-brass uppercase">MYS FLEET</div>
              <h1 className="mt-1 font-brand text-4xl font-light text-fleet-navy print:text-2xl">{boatName}</h1>
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1.5 text-sm print:mt-2">
                <div>
                  <span className="text-fleet-ink">{t("report_period_label")}: </span>
                  <span className="font-medium text-fleet-navy" dir="ltr">
                    {formatDateDisplay(from)} – {formatDateDisplay(to)}
                  </span>
                </div>
                <div>
                  <span className="text-fleet-ink">{t("report_generated_on")}: </span>
                  <span className="font-medium text-fleet-navy" dir="ltr">{formatDateDisplay(generatedOn)}</span>
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
                  className="h-64 w-64 shrink-0"
                />
                <div className="flex w-full flex-col gap-1">
                  {categoryTotals.map((c) => (
                    <div key={c.category} className="flex items-center gap-2 border-b border-dotted border-fleet-border py-2 text-sm print:py-1">
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
                  <th className="py-3 ps-3 text-center print:hidden">{t("view_receipt")}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.expenseList.map((e, idx) => {
                  const receiptUrl = (e.receiptPath && receiptUrls.get(e.receiptPath)) || (e.photoPath && receiptUrls.get(e.photoPath)) || null;
                  return (
                  <tr key={idx} className={`print:break-inside-avoid ${idx % 2 === 1 ? "bg-fleet-paper" : ""}`}>
                    <td className="py-3 pe-3 whitespace-nowrap">
                      <span dir="ltr">{formatDateDisplay(e.date)}</span>
                    </td>
                    <td className="py-3 pe-3 break-words">{e.description}</td>
                    <td className="py-3 pe-3 whitespace-nowrap break-words print:whitespace-normal">{e.category ? categoryLabels[e.category] : t("not_set_yet")}</td>
                    <td className="py-3 pe-3 whitespace-nowrap break-words print:whitespace-normal">{e.paymentMethod ? paymentLabels[e.paymentMethod] : "—"}</td>
                    <td className="py-3 text-end font-medium whitespace-nowrap">{formatCurrency(e.amount)}</td>
                    <td className="py-3 ps-3 text-center print:hidden">
                      {receiptUrl && (
                        <a
                          href={receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("view_receipt")}
                          title={t("view_receipt")}
                          className="inline-flex text-fleet-ink hover:text-fleet-teal"
                        >
                          <ReceiptEuro size={14} />
                        </a>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* ===== Awaiting Payment ===== */}
      {(snapshot.unpaidExpenseList?.length ?? 0) > 0 && (
        // Forced onto its own printed page rather than just `print:mt-4`
        // like every section above it - the main Transactions table has no
        // fixed length, so its last rows can land right at a page boundary,
        // and this heading rendered directly after them (with only a
        // margin, no break of its own) could end up overlapping that
        // boundary instead of cleanly starting below it.
        <div
          className="flex flex-col gap-4 print:mt-4 print:break-before-page"
          // Belt-and-suspenders alongside the Tailwind class above - the
          // legacy property name, which print engines have honored longer
          // and more consistently than the newer break-before syntax it's
          // aliased to. Harmless outside of paginated output (print/PDF),
          // so it's always applied, not just print:-scoped.
          style={{ pageBreakBefore: "always" }}
        >
          <h2 className={`${sectionTitleClass} mt-4`}>{t("report_awaiting_payment_title")}</h2>
          <div className={`${cardClass} border-fleet-brass/40 bg-fleet-highlight print:bg-white`}>
            <p className="mb-3 text-xs text-fleet-ink print:hidden">{t("report_awaiting_payment_hint")}</p>
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full text-sm print:table-fixed print:text-3xs">
                <thead>
                  <tr className="border-b-2 border-fleet-navy text-xs font-semibold tracking-wide text-fleet-ink uppercase">
                    <th className="py-3 pe-3 text-start print:w-[16%]">{t("date")}</th>
                    <th className="py-3 pe-3 text-start print:w-[46%]">{t("description")}</th>
                    <th className="py-3 pe-3 text-start print:w-[18%]">{t("report_type_of_expense")}</th>
                    <th className="py-3 text-end print:w-[20%]">{t("amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.unpaidExpenseList!.map((e, idx) => (
                    <tr key={idx} className="print:break-inside-avoid">
                      <td className="py-3 pe-3 whitespace-nowrap">
                        <span dir="ltr">{formatDateDisplay(e.date)}</span>
                      </td>
                      <td className="py-3 pe-3 break-words">{e.description}</td>
                      <td className="py-3 pe-3 whitespace-nowrap break-words print:whitespace-normal">
                        {e.category ? categoryLabels[e.category] : t("not_set_yet")}
                      </td>
                      <td className="py-3 text-end font-medium whitespace-nowrap">{formatCurrency(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-fleet-navy font-bold">
                    <td colSpan={3} className="py-3 pe-3 text-end">
                      {t("total")}
                    </td>
                    <td className="py-3 text-end whitespace-nowrap">{formatCurrency(snapshot.totalUnpaid ?? 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
