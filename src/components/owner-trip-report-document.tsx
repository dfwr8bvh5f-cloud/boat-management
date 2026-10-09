import Image from "next/image";
import { Ship } from "lucide-react";
import { CategoryPieChartFixed } from "@/components/category-pie-chart-fixed";
import { formatDateDisplay } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { OwnerTripReport } from "@/lib/owner-trip-report-data";
import type { PaymentMethod } from "@/lib/types/database";

// Same "€1,234.56" shape as formatCurrency, but always two decimals so a
// report's amounts line up (formatCurrency drops trailing zeros).
const formatCurrency = (n: number) =>
  `€${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SUBCATEGORY_PALETTE: Record<string, string> = {
  guest_f_and_b: "#0b1f38", // fleet-navy
  fuel: "#4c6585", // fleet-brass
  marina_berth: "#78bb7a", // fleet-moss
  guest_transportation: "#c98787", // fleet-coral
  guest_other: "#b9b750", // fleet-amber
};
const FALLBACK_COLOR = "#5b6472"; // fleet-ink

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
      // Report-only palette, drawn solely from the app's fleet-* tokens.
      // A legacy expense with no subcategory gets fleet-ink so it never
      // reuses a real subcategory's color.
      color: s.subcategory ? (SUBCATEGORY_PALETTE[s.subcategory] ?? FALLBACK_COLOR) : FALLBACK_COLOR,
    }));

  const sectionTitleClass =
    "text-[11px] font-semibold tracking-[0.18em] text-fleet-brass uppercase print:break-after-avoid";
  const maxMethod = Math.max(1, ...report.byPaymentMethod.map((m) => m.sum));

  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col bg-white px-2 py-4 sm:px-8 sm:py-8 print:block print:max-w-none print:p-0 print-page-owner-trip"
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
    >
      {/* The app shell paints the body fleet-paper; a printed report is plain white. */}
      <style>{"@media print{html,body{background:#fff!important}}"}</style>
      <header className="flex items-start justify-between gap-6 border-b border-fleet-navy pb-6 print:break-inside-avoid print:pb-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-fleet-brass uppercase">MYS FLEET</div>
          <h1 className="mt-2 font-brand text-4xl font-light leading-tight text-fleet-navy print:text-3xl">{boatName}</h1>
          <div className="mt-1 text-base font-medium text-fleet-navy">{t("owner_trip_report_title")}</div>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-xs text-fleet-ink">
            <div>
              {t("report_period_label")}:{" "}
              <span className="font-medium text-fleet-navy" dir="ltr">
                {formatDateDisplay(report.from)} – {formatDateDisplay(report.to)}
              </span>
            </div>
            <div>
              {t("report_generated_on")}:{" "}
              <span className="font-medium text-fleet-navy" dir="ltr">{formatDateDisplay(generatedOn)}</span>
            </div>
          </div>
        </div>
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center print:h-14 print:w-14">
          {logoUrl ? (
            <Image src={logoUrl} alt="" fill sizes="64px" className="object-contain" />
          ) : (
            <Ship size={28} className="text-fleet-brass" />
          )}
        </div>
      </header>

      <section className="py-8 print:break-inside-avoid print:py-5">
        <div className={sectionTitleClass}>{t("owner_trip_report_total_label")}</div>
        <div className="mt-2 text-5xl font-light tracking-tight text-fleet-navy tabular-nums print:text-4xl">
          <span dir="ltr">{formatCurrency(report.total)}</span>
        </div>
      </section>

      {(subcategoryTotals.length > 0 || report.total > 0) && (
        <div className="grid grid-cols-1 gap-10 border-t border-fleet-border py-8 md:grid-cols-2 print:grid-cols-2 print:gap-8 print:break-inside-avoid print:py-5">
          {subcategoryTotals.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className={sectionTitleClass}>{t("owner_trip_report_subcategory_section")}</h2>
              <div className="flex items-center gap-4">
                <div className="shrink-0">
                  <CategoryPieChartFixed data={subcategoryTotals.map((s) => ({ name: s.label, value: s.sum, color: s.color }))} size={120} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  {subcategoryTotals.map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-3 border-b border-fleet-border py-1.5 text-xs last:border-b-0">
                      <span className="flex min-w-0 items-center gap-2 text-fleet-navy">
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className="leading-tight">{s.label}</span>
                      </span>
                      <span className="font-medium text-fleet-navy whitespace-nowrap tabular-nums" dir="ltr">{formatCurrency(s.sum)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {report.total > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className={sectionTitleClass}>{t("owner_trip_report_payment_section")}</h2>
              <div className="flex flex-col gap-4 pt-1">
                {report.byPaymentMethod.map((m) => (
                  <div key={m.method} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="text-fleet-ink">{paymentLabels[m.method]}</span>
                      <span className="font-medium text-fleet-navy whitespace-nowrap tabular-nums" dir="ltr">{formatCurrency(m.sum)}</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-fleet-highlight">
                      <div className="h-full rounded-full bg-fleet-navy" style={{ width: `${(m.sum / maxMethod) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <section className="border-t border-fleet-border pt-8 print:pt-5">
        <h2 className={`${sectionTitleClass} mb-3`}>{t("report_transactions_title")}</h2>
        {report.expenseList.length === 0 ? (
          <p className="text-sm text-fleet-ink">{t("owner_trip_report_no_data")}</p>
        ) : (
          <table className="w-full table-fixed text-start text-[13px] print:text-[10.5px]">
            <colgroup>
              <col style={{ width: "13%" }} />
              <col style={{ width: "38%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead className="table-header-group">
              <tr className="border-b border-fleet-navy text-[10px] font-semibold tracking-[0.12em] text-fleet-ink uppercase">
                <th className="py-2 pe-3 text-start font-semibold">{t("date")}</th>
                <th className="py-2 pe-3 text-start font-semibold">{t("description")}</th>
                <th className="py-2 pe-3 text-start font-semibold">{t("expense_subcategory_label")}</th>
                <th className="py-2 pe-3 text-start font-semibold">{t("payment_method")}</th>
                <th className="py-2 text-end font-semibold">{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              {report.expenseList.map((e, idx) => (
                <tr key={idx} className="border-b border-fleet-border align-top print:break-inside-avoid">
                  <td className="py-2.5 pe-3 whitespace-nowrap text-fleet-ink">
                    <span dir="ltr">{formatDateDisplay(e.date)}</span>
                  </td>
                  <td className="py-2.5 pe-3 leading-snug break-words text-fleet-navy">{e.description}</td>
                  <td className="py-2.5 pe-3 leading-snug break-words text-fleet-ink">
                    {e.subcategory ? (subcategoryLabels[e.subcategory] ?? e.subcategory) : t("not_set_yet")}
                  </td>
                  <td className="py-2.5 pe-3 leading-snug break-words text-fleet-ink">
                    {e.paymentMethod ? paymentLabels[e.paymentMethod] : t("not_set_yet")}
                  </td>
                  <td className="py-2.5 text-end font-semibold text-fleet-navy whitespace-nowrap tabular-nums" dir="ltr">
                    {formatCurrency(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
