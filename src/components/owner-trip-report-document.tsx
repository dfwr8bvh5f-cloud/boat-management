import Image from "next/image";
import { Ship } from "lucide-react";
import { CategoryPieChartFixed } from "@/components/category-pie-chart-fixed";
import { PaymentMethodBarChart } from "@/components/payment-method-bar-chart";
import { ReportKpiCard } from "@/components/report-kpi-card";
import { OWNER_TRIP_SUBCATEGORY_COLORS } from "@/lib/labels";
import { formatDateDisplay } from "@/lib/date-format";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { OwnerTripReport } from "@/lib/owner-trip-report-data";
import type { PaymentMethod } from "@/lib/types/database";

// Deliberately narrow, unlike FinancialReportDocument: just what this one
// trip cost, not the boat's own financial state (no balances, no income, no
// budget-vs-actual) - per her explicit ask.
export function OwnerTripReportDocument({
  boatName,
  logoUrl,
  report,
  subcategoryLabels,
  paymentLabels,
  generatedOn,
  locale,
}: {
  boatName: string;
  logoUrl: string | null;
  report: OwnerTripReport;
  subcategoryLabels: Record<string, string>;
  paymentLabels: Record<PaymentMethod, string>;
  generatedOn: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);

  const subcategoryTotals = report.bySubcategory
    .filter((s) => s.sum > 0)
    .map((s) => ({
      key: s.subcategory ?? "__none",
      label: s.subcategory ? (subcategoryLabels[s.subcategory] ?? s.subcategory) : t("not_set_yet"),
      sum: s.sum,
      // A legacy owner-trip expense entered before subcategories existed
      // has none - shown in a neutral gray rather than silently reusing
      // one of the 5 real subcategory colors for something that isn't it.
      color: s.subcategory ? (OWNER_TRIP_SUBCATEGORY_COLORS[s.subcategory] ?? "#9aa3af") : "#9aa3af",
    }));

  const sectionTitleClass = "text-2xl font-semibold tracking-tight text-fleet-navy print:text-lg print:break-after-avoid";
  const cardClass = "rounded-xl border border-fleet-border bg-white p-6 sm:p-8 shadow-sm print:shadow-none print:p-4";

  return (
    <div
      className="flex flex-col gap-4 print:block print-page-financial-report"
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
    >
      <div className="flex flex-col gap-8 print:gap-3">
        <div className={`${cardClass} print:break-inside-avoid`}>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="text-xs font-semibold tracking-[0.2em] text-fleet-brass uppercase">MYS FLEET</div>
              <h1 className="mt-1 font-brand text-4xl font-light text-fleet-navy print:text-2xl">{boatName}</h1>
              <div className="mt-2 text-sm text-fleet-ink">{t("owner_trip_report_title")}</div>
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1.5 text-sm print:mt-2">
                <div>
                  <span className="text-fleet-ink">{t("report_period_label")}: </span>
                  <span className="font-medium text-fleet-navy" dir="ltr">
                    {formatDateDisplay(report.from)} – {formatDateDisplay(report.to)}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
            <ReportKpiCard label={t("owner_trip_report_total_label")} value={formatCurrency(report.total)} />
          </div>
        </section>

        {subcategoryTotals.length > 0 && (
          <section className="flex flex-col gap-4 print:gap-2">
            <h2 className={sectionTitleClass}>{t("owner_trip_report_subcategory_section")}</h2>
            <div className={`${cardClass} print:break-inside-avoid`}>
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-10 print:flex-row print:gap-4">
                <div className="h-64 w-64 shrink-0">
                  <CategoryPieChartFixed data={subcategoryTotals.map((s) => ({ name: s.label, value: s.sum, color: s.color }))} size={256} />
                </div>
                <div className="flex w-full flex-col gap-1">
                  {subcategoryTotals.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 border-b border-dotted border-fleet-border py-2 text-sm print:py-1">
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                        {s.label}
                      </span>
                      <span className="font-medium text-fleet-navy">{formatCurrency(s.sum)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {report.total > 0 && (
          <section className="flex flex-col gap-4 print:gap-2">
            <h2 className={sectionTitleClass}>{t("owner_trip_report_payment_section")}</h2>
            <div className={`${cardClass} print:break-inside-avoid`}>
              <PaymentMethodBarChart data={report.byPaymentMethod} labels={paymentLabels} />
            </div>
          </section>
        )}
      </div>

      <div className="flex flex-col gap-4 print:mt-4">
        <h2 className={`${sectionTitleClass} mt-4`}>{t("report_transactions_title")}</h2>
        <div className={cardClass}>
          {report.expenseList.length === 0 ? (
            <p className="text-sm text-fleet-ink">{t("owner_trip_report_no_data")}</p>
          ) : (
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full text-sm print:table-fixed print:text-3xs">
                <thead>
                  <tr className="border-b border-fleet-border text-xs font-semibold tracking-wide text-fleet-ink uppercase">
                    <th className="pb-3 pe-3 text-start print:pb-1.5">{t("date")}</th>
                    <th className="pb-3 pe-3 text-start print:pb-1.5">{t("description")}</th>
                    <th className="pb-3 pe-3 text-start print:pb-1.5">{t("expense_subcategory_label")}</th>
                    <th className="pb-3 pe-3 text-start print:pb-1.5">{t("payment_method")}</th>
                    <th className="pb-3 text-end print:pb-1.5">{t("amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.expenseList.map((e, idx) => (
                    <tr key={idx} className="border-b border-fleet-border/60 last:border-b-0">
                      <td className="py-3 pe-3 whitespace-nowrap print:py-1.5">
                        <span dir="ltr">{formatDateDisplay(e.date)}</span>
                      </td>
                      <td className="py-3 pe-3 print:py-1.5">{e.description}</td>
                      <td className="py-3 pe-3 text-fleet-ink print:py-1.5">
                        {e.subcategory ? (subcategoryLabels[e.subcategory] ?? e.subcategory) : t("not_set_yet")}
                      </td>
                      <td className="py-3 pe-3 text-fleet-ink print:py-1.5">
                        {e.paymentMethod ? paymentLabels[e.paymentMethod] : t("not_set_yet")}
                      </td>
                      <td className="py-3 text-end font-semibold text-fleet-navy whitespace-nowrap print:py-1.5">
                        {formatCurrency(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
