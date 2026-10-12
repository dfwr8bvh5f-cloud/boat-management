import Image from "next/image";
import { Ship } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

// Same "€1,234.56" shape as the other printed reports (owner-trip,
// financial) - always two decimals + thousands separator, unlike the
// screen's formatCurrency (src/lib/money.ts) which drops trailing zeros.
const formatCurrency = (n: number) =>
  `€${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// DD/MM/YYYY specifically for this printed report, per her explicit ask -
// distinct from the app's own DD-MM-YYYY on-screen convention
// (formatDateDisplay, src/lib/date-format.ts), which stays unchanged
// everywhere else in the app.
const formatDateSlash = (iso: string | null | undefined) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

export type ExpenseListPrintRow = {
  id: string;
  date: string | null;
  description: string;
  category: string;
  paymentMethod: string;
  amount: number;
};

// Shared printed/PDF layout for a list of expenses with a total - built for
// the boat expenses list's three print scopes (full list, pending drafts,
// marked selection) but deliberately generic (boat name + logo, a report
// title, period derived from the rows themselves, an optional filters
// summary, the table, a total row) so any other report listing expenses
// can reuse it instead of hand-rolling its own print table. Matches the
// header/table conventions already established by
// OwnerTripReportDocument/FinancialReportDocument - same fonts, colors,
// spacing, and the same documented print-engine workarounds (named @page
// for A4 + page numbers, the total row living in <tbody> instead of
// <tfoot> to avoid Chrome pushing it onto its own trailing page).
export function ExpenseListPrintDocument({
  boatName,
  logoUrl,
  reportTitle,
  subtitle,
  filtersSummary,
  generatedOn,
  rows,
  total,
  locale,
}: {
  boatName: string;
  logoUrl: string | null;
  reportTitle: string;
  subtitle?: string | null;
  filtersSummary?: string | null;
  generatedOn: string;
  rows: ExpenseListPrintRow[];
  total: number;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);

  // The report's own period is derived from whatever's actually in it
  // (not from whatever date filter happens to be active on screen) - that
  // way it's always correct for all three scopes, including the marked-
  // selection one, which isn't a filtered view at all.
  const sortedDates = rows
    .map((r) => r.date)
    .filter((d): d is string => Boolean(d))
    .sort();
  const periodLabel =
    sortedDates.length > 0 ? `${formatDateSlash(sortedDates[0])} – ${formatDateSlash(sortedDates[sortedDates.length - 1])}` : null;

  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col bg-white px-2 py-4 sm:px-8 sm:py-8 print:block print:max-w-none print:p-0 print-page-report-list"
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
    >
      {/* The app shell paints the body fleet-paper; a printed report is plain white. */}
      <style>{"@media print{html,body{background:#fff!important}}"}</style>
      <header className="flex items-start justify-between gap-6 border-b border-fleet-navy pb-6 print:break-inside-avoid print:pb-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-fleet-brass uppercase">MYS FLEET</div>
          <h1 className="mt-2 font-brand text-4xl font-light leading-tight text-fleet-navy print:text-3xl">{boatName}</h1>
          <div className="mt-1 text-base font-medium text-fleet-navy">
            {reportTitle}
            {subtitle ? <span className="font-normal text-fleet-ink"> · {subtitle}</span> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-xs text-fleet-ink">
            {periodLabel && (
              <div>
                {t("report_period_label")}:{" "}
                <span className="font-medium text-fleet-navy" dir="ltr">
                  {periodLabel}
                </span>
              </div>
            )}
            <div>
              {t("report_generated_on")}:{" "}
              <span className="font-medium text-fleet-navy" dir="ltr">
                {formatDateSlash(generatedOn)}
              </span>
            </div>
          </div>
          {filtersSummary && (
            <div className="mt-2 text-xs text-fleet-ink">
              {t("expense_filters")}: <span className="text-fleet-navy">{filtersSummary}</span>
            </div>
          )}
        </div>
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center print:h-14 print:w-14">
          {logoUrl ? (
            <Image src={logoUrl} alt="" fill sizes="64px" className="object-contain" />
          ) : (
            <Ship size={28} className="text-fleet-brass" />
          )}
        </div>
      </header>

      <section className="pt-6 print:pt-5">
        <table className="w-full table-fixed border-collapse text-start text-[13px] print:text-[10.5px]">
          <colgroup>
            <col style={{ width: "11%" }} />
            <col style={{ width: "41%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead className="table-header-group">
            <tr className="border-b border-fleet-navy text-[10px] font-semibold tracking-[0.12em] text-fleet-ink uppercase">
              <th className="py-2 pe-3 text-start font-semibold">{t("date")}</th>
              <th className="py-2 pe-3 text-start font-semibold">{t("description")}</th>
              <th className="py-2 pe-3 text-start font-semibold">{t("category")}</th>
              <th className="py-2 pe-3 text-start font-semibold">{t("payment_method")}</th>
              <th className="py-2 text-end font-semibold">{t("amount")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[#e3e6ec] align-top print:break-inside-avoid">
                <td className="py-2.5 pe-3 whitespace-nowrap text-fleet-ink">
                  <span dir="ltr">{formatDateSlash(r.date) ?? t("not_set_yet")}</span>
                </td>
                <td className="py-2.5 pe-3 leading-snug break-words text-fleet-navy">{r.description}</td>
                <td className="py-2.5 pe-3 leading-snug break-words text-fleet-ink">{r.category}</td>
                <td className="py-2.5 pe-3 leading-snug break-words text-fleet-ink">{r.paymentMethod}</td>
                <td className="py-2.5 text-end font-semibold text-fleet-navy whitespace-nowrap tabular-nums" dir="ltr">
                  {formatCurrency(r.amount)}
                </td>
              </tr>
            ))}
            {/* A plain <tr> in the same <tbody>, not a <tfoot> - see
                FinancialReportDocument: Chrome's print engine was observed
                always pushing a <tfoot> row onto its own trailing page,
                even with break-inside-avoid set on every ancestor. Table
                foot/header row-groups get their own special (and buggy)
                print fragmentation handling that a plain body row doesn't. */}
            <tr className="border-t-2 border-fleet-navy font-bold">
              <td colSpan={4} className="py-3 pe-3 text-end text-fleet-navy">
                {t("total")}
              </td>
              <td className="py-3 text-end text-fleet-navy whitespace-nowrap tabular-nums" dir="ltr">
                {formatCurrency(total)}
              </td>
            </tr>
          </tbody>
        </table>
        {rows.length === 0 && <p className="mt-4 text-sm text-fleet-ink">{t("none_expenses")}</p>}
      </section>
    </div>
  );
}
