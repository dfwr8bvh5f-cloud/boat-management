import Image from "next/image";
import { Ship, ReceiptEuro } from "lucide-react";
// Statically imported, not the report-charts-lazy dynamic()-wrapped
// version - this document can be printed the instant it mounts (the live
// report page's own "Print" button calls window.print() with no wait at
// all, and native Cmd+P is even less predictable), and a lazy chunk that
// hasn't finished loading yet by then gets captured mid-skeleton, not as
// the real chart. A static import renders synchronously in the same pass
// as everything else, so there's no async gap left to race against.
import { CategoryPieChartFixed } from "@/components/category-pie-chart-fixed";
import { BudgetHealthBars } from "@/components/budget-health-bars";
import { formatDateDisplay } from "@/lib/date-format";
import { formatCurrencySigned as formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { ExpenseCategory, FinancialSnapshot, PaymentMethod } from "@/lib/types/database";

const TONE_CLASSES = {
  neutral: "text-fleet-navy",
  positive: "text-fleet-moss-text",
  negative: "text-fleet-coral-text",
} as const;

function budgetUsedTone(pct: number): keyof typeof TONE_CLASSES {
  if (pct > 100) return "negative";
  if (pct > 70) return "neutral";
  return "positive";
}

// Separators use the literal fleet-border hex (#e3e6ec), not the
// border-fleet-border class, same reasoning as OwnerTripReportDocument/
// ExpenseListPrintDocument: globals.css adds a box-shadow to that class
// app-wide, which would put a faint shadow under every divider here -
// invisible in the app's own UI (where a soft card shadow is the point)
// but very visible as an unwanted smudge under a printed report's plain
// rules. This document now follows the same flat, card-free, boxless
// layout as those two - no rounded/bordered/shadowed "tiles", just
// section dividers and spacing, matching the invoice document's own
// visual language (src/app/(app)/mys/invoices/[id]/page.tsx).
const DIVIDER = "#e3e6ec";
const sectionTitleClass = "text-[11px] font-semibold tracking-[0.18em] text-fleet-brass uppercase print:break-after-avoid";

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
  const hasUnpaid = (snapshot.unpaidExpenseList?.length ?? 0) > 0;
  const hasUpcoming = (snapshot.upcomingExpenseList?.length ?? 0) > 0;

  const categoryComparisonData = budgetRows
    .filter((b) => b.budget > 0)
    .map((b) => ({ label: b.label, budget: b.budget, spent: b.spentYtd }));

  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col bg-white px-2 py-4 sm:px-8 sm:py-8 print:block print:max-w-none print:p-0 print:pt-[15mm] print-page-financial-report"
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
    >
      {/* The app shell paints the body fleet-paper; a printed report is plain white. */}
      <style>{"@media print{html,body{background:#fff!important}}"}</style>

      {/* ===== Header ===== */}
      <header className="flex items-start justify-between gap-6 border-b border-fleet-navy pb-6 print:break-inside-avoid print:pb-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-fleet-brass uppercase">MYS FLEET</div>
          <h1 className="mt-2 font-brand text-4xl font-light leading-tight text-fleet-navy print:text-3xl">{boatName}</h1>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-xs text-fleet-ink print:mt-2">
            <div>
              {t("report_period_label")}:{" "}
              <span className="font-medium text-fleet-navy" dir="ltr">
                {formatDateDisplay(from)} – {formatDateDisplay(to)}
              </span>
            </div>
            <div>
              {t("report_generated_on")}:{" "}
              <span className="font-medium text-fleet-navy" dir="ltr">{formatDateDisplay(generatedOn)}</span>
            </div>
          </div>
          {snapshot.categoryFilter && snapshot.categoryFilter.length > 0 && (
            // Every expense-derived figure in this document only ever
            // reflects these categories (see computeFinancialSnapshot) -
            // called out here so reading this report cold never reads as
            // the boat's full picture by mistake.
            <div className="mt-1.5 text-xs text-fleet-ink">
              {t("report_category_filter_label")}:{" "}
              <span className="font-medium text-fleet-navy">{snapshot.categoryFilter.map((c) => categoryLabels[c]).join(", ")}</span>
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

      {/* ===== Executive Summary ===== */}
      <section className="border-t py-6 print:break-inside-avoid print:py-4" style={{ borderColor: DIVIDER }}>
        <h2 className={sectionTitleClass}>{t("report_section_executive_summary")}</h2>
        <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4 print:mt-3 print:gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-2xs font-medium tracking-wide text-fleet-ink uppercase">{t("report_bank_balance")}</div>
            <div
              className={`text-2xl font-semibold tabular-nums whitespace-nowrap print:text-lg ${TONE_CLASSES[snapshot.bankBalance >= 0 ? "positive" : "negative"]}`}
              dir="ltr"
            >
              {formatCurrency(snapshot.bankBalance)}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-2xs font-medium tracking-wide text-fleet-ink uppercase">{t("report_cash_balance")}</div>
            <div
              className={`text-2xl font-semibold tabular-nums whitespace-nowrap print:text-lg ${TONE_CLASSES[snapshot.cashBalance >= 0 ? "positive" : "negative"]}`}
              dir="ltr"
            >
              {formatCurrency(snapshot.cashBalance)}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-2xs font-medium tracking-wide text-fleet-ink uppercase">{t("report_kpi_total_expenses")}</div>
            <div className="text-2xl font-semibold tabular-nums whitespace-nowrap text-fleet-navy print:text-lg" dir="ltr">
              {formatCurrency(snapshot.totalExpenses)}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-2xs font-medium tracking-wide text-fleet-ink uppercase">{t("report_kpi_budget_used")}</div>
            <div className={`text-2xl font-semibold tabular-nums whitespace-nowrap print:text-lg ${TONE_CLASSES[budgetUsedTone(budgetUsedPct)]}`} dir="ltr">
              {budgetUsedPct}%
            </div>
            <div className="text-xs text-fleet-ink" dir="ltr">
              {formatCurrency(snapshot.totalSpentYtd)} / {formatCurrency(snapshot.totalAnnualBudget)}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Financial Overview ===== */}
      {categoryTotals.length > 0 && (
        <section className="border-t py-6 print:break-inside-avoid print:py-4" style={{ borderColor: DIVIDER }}>
          <h2 className={sectionTitleClass}>{t("report_period_totals_title")}</h2>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-10 print:mt-3 print:flex-row print:gap-6">
            <div className="h-44 w-44 shrink-0 print:h-36 print:w-36">
              <CategoryPieChartFixed data={categoryTotals.map((c) => ({ name: c.label, value: c.sum, color: c.color }))} size={176} />
            </div>
            <div className="flex w-full flex-col">
              {categoryTotals.map((c) => (
                <div key={c.category} className="flex items-center justify-between gap-3 border-b py-2 text-sm print:py-1" style={{ borderColor: DIVIDER }}>
                  <span className="flex items-center gap-2 text-fleet-navy">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    {c.label}
                  </span>
                  <span className="font-medium text-fleet-navy tabular-nums whitespace-nowrap" dir="ltr">{formatCurrency(c.sum)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== Top Expenses ===== */}
      {topExpenses.length > 0 && (
        <section className="border-t py-6 print:break-inside-avoid print:py-4" style={{ borderColor: DIVIDER }}>
          <h2 className={sectionTitleClass}>{t("report_top_expenses_title")}</h2>
          <table className="mt-4 w-full table-fixed text-start text-sm print:mt-3 print:text-[10.5px]">
            <colgroup>
              <col style={{ width: "40%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
            <thead className="table-header-group">
              <tr className="border-b border-fleet-navy text-xs font-semibold tracking-wide text-fleet-ink uppercase">
                <th className="py-2 pe-3 text-start">{t("description")}</th>
                <th className="py-2 pe-3 text-start">{t("report_type_of_expense")}</th>
                <th className="py-2 pe-3 text-start">{t("date")}</th>
                <th className="py-2 text-end">{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              {topExpenses.map((e, idx) => (
                <tr key={idx} className="border-b align-top print:break-inside-avoid" style={{ borderColor: DIVIDER }}>
                  <td className="py-2.5 pe-3 leading-snug break-words">{e.description}</td>
                  <td className="py-2.5 pe-3 leading-snug break-words text-fleet-ink">{e.category ? categoryLabels[e.category] : t("not_set_yet")}</td>
                  <td className="py-2.5 pe-3 whitespace-nowrap text-fleet-ink">
                    <span dir="ltr">{formatDateDisplay(e.date)}</span>
                  </td>
                  <td className="py-2.5 text-end font-semibold text-fleet-navy tabular-nums whitespace-nowrap" dir="ltr">{formatCurrency(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ===== Budget Health ===== */}
      {categoryComparisonData.length > 0 && (
        <section className="border-t py-6 print:break-inside-avoid print:py-4" style={{ borderColor: DIVIDER }}>
          <h2 className={sectionTitleClass}>{t("report_budget_health_title")}</h2>
          <div className="mt-4 print:mt-3">
            <BudgetHealthBars rows={budgetRows} overBudgetLabel={t("report_over_budget_label")} />
          </div>
        </section>
      )}

      {/* ===== Transactions ===== */}
      <section className="border-t pt-6 print:pt-4" style={{ borderColor: DIVIDER }}>
        <h2 className={`${sectionTitleClass} mb-3`}>{t("report_transactions_title")}</h2>
        {snapshot.expenseList.length === 0 ? (
          <p className="text-sm text-fleet-ink">{t("report_no_data_period")}</p>
        ) : (
          <table className="w-full table-fixed text-start text-sm print:text-[10.5px]">
            <colgroup>
              <col style={{ width: "13%" }} />
              <col style={{ width: "33%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "14%" }} />
              <col className="print:hidden" style={{ width: "6%" }} />
            </colgroup>
            {/* A plain table-header-group (not sticky, no display-type
                downgrade) - matching the already-proven pattern in
                OwnerTripReportDocument/ExpenseListPrintDocument, which
                repeat correctly across pages with none of the phantom-
                trailing-page behavior this table used to work around with
                a `sticky` + forced-static-display hack. That hack is gone
                along with the "Awaiting Payment" forced page-break below -
                both were compensating for the same underlying issue. */}
            <thead className="table-header-group">
              <tr className="border-b border-fleet-navy text-xs font-semibold tracking-wide text-fleet-ink uppercase">
                <th className="py-2 pe-3 text-start">{t("date")}</th>
                <th className="py-2 pe-3 text-start">{t("description")}</th>
                <th className="py-2 pe-3 text-start">{t("report_type_of_expense")}</th>
                <th className="py-2 pe-3 text-start">{t("report_paid_with")}</th>
                <th className="py-2 text-end">{t("amount")}</th>
                <th className="py-2 ps-3 text-center print:hidden">{t("view_receipt")}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.expenseList.map((e, idx) => {
                const receiptUrl = (e.receiptPath && receiptUrls.get(e.receiptPath)) || (e.photoPath && receiptUrls.get(e.photoPath)) || null;
                return (
                  <tr key={idx} className="border-b align-top print:break-inside-avoid" style={{ borderColor: DIVIDER }}>
                    <td className="py-2.5 pe-3 whitespace-nowrap text-fleet-ink">
                      <span dir="ltr">{formatDateDisplay(e.date)}</span>
                    </td>
                    <td className="py-2.5 pe-3 leading-snug break-words">{e.description}</td>
                    <td className="py-2.5 pe-3 leading-snug break-words text-fleet-ink">{e.category ? categoryLabels[e.category] : t("not_set_yet")}</td>
                    <td className="py-2.5 pe-3 leading-snug break-words text-fleet-ink">{e.paymentMethod ? paymentLabels[e.paymentMethod] : t("not_set_yet")}</td>
                    <td className="py-2.5 text-end font-medium text-fleet-navy tabular-nums whitespace-nowrap" dir="ltr">{formatCurrency(e.amount)}</td>
                    <td className="py-2.5 ps-3 text-center print:hidden">
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
        )}
      </section>

      {/* ===== Awaiting Payment =====
          Plain flex rows, not a <table> - this list is always short (a
          handful of expenses at most, never a multi-page spread), so
          there's no real need for table semantics/repeating headers here,
          and it sidesteps an observed Chrome print-pagination bug entirely:
          a real <table>'s own internal fragmentation logic occasionally
          pushed this whole section to a fresh page (correctly, honoring
          break-inside-avoid) but then rendered only its first row there,
          clipped, with the rest of that page left blank - a table-specific
          quirk a plain div list never triggers.

          break-inside-avoid deliberately does NOT sit on the whole
          <section> - that was tried and, when the section didn't fully
          fit in the remaining room on a page, Chrome silently dropped the
          overflowing part (observed losing the bold Total row entirely,
          with no third page created to hold it) rather than pushing the
          whole block to a fresh page. Financial figures can never be
          allowed to silently disappear, so instead only the heading+
          column-header (as one atomic intro block) and each individual
          row (including the Total row) get their own break-inside-avoid -
          every one of those small pieces always fits on a single page, so
          each is guaranteed to actually render somewhere, even if the
          section as a whole ends up split across a page boundary. */}
      {hasUnpaid && (
        <section className="border-t pt-6 print:pt-4" style={{ borderColor: DIVIDER }}>
          <div className="print:break-inside-avoid">
            <h2 className={`${sectionTitleClass} mb-1`}>{t("report_awaiting_payment_title")}</h2>
            <p className="mb-3 text-xs text-fleet-ink print:hidden">{t("report_awaiting_payment_hint")}</p>
            {/* No gap-x between columns - a grid gap adds its own width on
                top of the percentage columns (which already sum to 100%),
                overflowing the page's right margin. Padding on each cell
                (matching the old table's per-<td> pe-3), not a grid gap,
                is what the table-based sections above use for the same
                reason. */}
            <div className="grid grid-cols-[16%_46%_18%_20%] border-b border-fleet-navy pb-2 text-xs font-semibold tracking-wide text-fleet-ink uppercase">
              <div className="pe-3">{t("date")}</div>
              <div className="pe-3">{t("description")}</div>
              <div className="pe-3">{t("report_type_of_expense")}</div>
              <div className="text-end">{t("amount")}</div>
            </div>
          </div>
          {snapshot.unpaidExpenseList!.map((e, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[16%_46%_18%_20%] border-b py-2.5 text-sm print:break-inside-avoid print:text-[10.5px]"
              style={{ borderColor: DIVIDER }}
            >
              <div className="pe-3 whitespace-nowrap text-fleet-ink">
                <span dir="ltr">{formatDateDisplay(e.date)}</span>
              </div>
              <div className="pe-3 leading-snug break-words">{e.description}</div>
              <div className="pe-3 leading-snug break-words text-fleet-ink">{e.category ? categoryLabels[e.category] : t("not_set_yet")}</div>
              <div className="text-end font-medium text-fleet-navy tabular-nums whitespace-nowrap" dir="ltr">{formatCurrency(e.amount)}</div>
            </div>
          ))}
          <div className="grid grid-cols-[80%_20%] border-t-2 border-fleet-navy py-2.5 text-sm font-bold print:text-[10.5px]">
            <div className="pe-3 text-end text-fleet-navy">{t("total")}</div>
            <div className="text-end text-fleet-navy tabular-nums whitespace-nowrap" dir="ltr">{formatCurrency(snapshot.totalUnpaid ?? 0)}</div>
          </div>
        </section>
      )}

      {/* ===== Upcoming / Planned Expenses =====
          Same plain-div-row treatment as Awaiting Payment above, and for
          the same reason - see the comment there for why break-inside-
          avoid sits on the heading+column-header and each row
          individually, never on the whole <section>. */}
      {hasUpcoming && (
        <section className="border-t pt-6 print:pt-4" style={{ borderColor: DIVIDER }}>
          <div className="print:break-inside-avoid">
            <h2 className={`${sectionTitleClass} mb-1`}>{t("report_upcoming_expenses_title")}</h2>
            <p className="mb-3 text-xs text-fleet-ink print:hidden">{t("report_upcoming_expenses_hint")}</p>
            <div className="grid grid-cols-[40%_22%_18%_20%] border-b border-fleet-navy pb-2 text-xs font-semibold tracking-wide text-fleet-ink uppercase">
              <div className="pe-3">{t("description")}</div>
              <div className="pe-3">{t("report_type_of_expense")}</div>
              <div className="pe-3">{t("report_expected_date")}</div>
              <div className="text-end">{t("amount")}</div>
            </div>
          </div>
          {snapshot.upcomingExpenseList!.map((e, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[40%_22%_18%_20%] border-b py-2.5 text-sm print:break-inside-avoid print:text-[10.5px]"
              style={{ borderColor: DIVIDER }}
            >
              <div className="pe-3 leading-snug break-words">{e.description}</div>
              <div className="pe-3 leading-snug break-words text-fleet-ink">{e.category ? categoryLabels[e.category] : t("not_set_yet")}</div>
              <div className="pe-3 whitespace-nowrap text-fleet-ink">
                <span dir="ltr">{formatDateDisplay(e.date)}</span>
              </div>
              <div className="text-end font-medium text-fleet-navy tabular-nums whitespace-nowrap" dir="ltr">{formatCurrency(e.amount)}</div>
            </div>
          ))}
          <div className="grid grid-cols-[80%_20%] border-t-2 border-fleet-navy py-2.5 text-sm font-bold print:text-[10.5px]">
            <div className="pe-3 text-end text-fleet-navy">{t("total")}</div>
            <div className="text-end text-fleet-navy tabular-nums whitespace-nowrap" dir="ltr">{formatCurrency(snapshot.totalUpcoming ?? 0)}</div>
          </div>
        </section>
      )}
      {/* Chrome's print pagination was observed dropping a short trailing
          block entirely (no new page created to hold it) specifically
          when that block was the very last element in the whole print
          flow and didn't fully fit the remaining room on the current
          page - reproduced consistently with the Awaiting Payment total
          row when Upcoming Expenses was absent. An inert trailing spacer
          with real (if tiny) height gives the print engine guaranteed
          content after every other block, so there's always something
          left to flow onto a fresh page, which keeps the real preceding
          content from being silently discarded instead. */}
      {/* Chrome's print pagination was observed dropping a short trailing
          block entirely (no new page created to hold it) specifically
          when that block was the very last element in the whole print
          flow and didn't fully fit the remaining room on the current
          page - reproduced consistently with the Awaiting Payment total
          row when Upcoming Expenses was absent. An inert trailing spacer
          with real (if tiny) height gives the print engine guaranteed
          content after every other block, so there's always something
          left to flow onto a fresh page, which keeps the real preceding
          content from being silently discarded instead. Financial totals
          must never go missing, so this stays even though it's a
          workaround rather than a root-cause fix for whatever Chrome
          engine quirk causes the drop. */}
      <div aria-hidden="true" style={{ height: 40 }} />
    </div>
  );
}
