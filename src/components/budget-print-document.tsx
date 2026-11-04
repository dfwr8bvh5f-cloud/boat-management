import { Fragment } from "react";
import Image from "next/image";
import { MYS_COMPANY_INFO } from "@/lib/mys-company-info";
import { formatCurrency } from "@/lib/money";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

export type BudgetPrintRow = {
  label: string;
  budget: number;
  spent: number;
  // Budget lines (subcategories) the category's budget is made of, if any.
  lines: { name: string; amount: number }[];
};

// Printable "Save as PDF" budget report for one boat: the annual budget by
// category and, when the boat has one, each separate-budget category (e.g.
// MINTU's Project 2027) with its own budget and spend. Hidden on screen,
// shown only through window.print() (see PrintButton) - same convention as
// the inventory and expenses print documents.
export function BudgetPrintDocument({
  boatName,
  boatLogoUrl,
  year,
  annual,
  separate,
  locale,
}: {
  boatName: string;
  boatLogoUrl: string | null;
  year: string;
  annual: BudgetPrintRow[];
  separate: BudgetPrintRow[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const sum = (rows: BudgetPrintRow[], key: "budget" | "spent") => rows.reduce((s, r) => s + r[key], 0);
  const pct = (spent: number, budget: number) => (budget > 0 ? `${Math.round((spent / budget) * 100)}%` : "—");

  const renderTable = (rows: BudgetPrintRow[]) => (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-fleet-paper">
          <th className="border-b border-fleet-border px-2 py-1.5 text-start font-semibold text-fleet-ink">{t("category")}</th>
          <th className="border-b border-fleet-border px-2 py-1.5 text-end font-semibold text-fleet-ink">{t("budget_planned_word")}</th>
          <th className="border-b border-fleet-border px-2 py-1.5 text-end font-semibold text-fleet-ink">{t("budget_spent_word")}</th>
          <th className="border-b border-fleet-border px-2 py-1.5 text-end font-semibold text-fleet-ink">{t("budget_remaining_word")}</th>
          <th className="border-b border-fleet-border px-2 py-1.5 text-end font-semibold text-fleet-ink">{t("budget_used_pct")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Fragment key={r.label}>
            <tr className="print:break-inside-avoid">
              <td className="border-b border-dotted border-fleet-border px-2 py-1 font-medium">{r.label}</td>
              <td className="border-b border-dotted border-fleet-border px-2 py-1 text-end">{formatCurrency(r.budget)}</td>
              <td className="border-b border-dotted border-fleet-border px-2 py-1 text-end">{formatCurrency(r.spent)}</td>
              <td className="border-b border-dotted border-fleet-border px-2 py-1 text-end">{formatCurrency(r.budget - r.spent)}</td>
              <td className="border-b border-dotted border-fleet-border px-2 py-1 text-end">{pct(r.spent, r.budget)}</td>
            </tr>
            {r.lines.map((l) => (
              <tr key={`${r.label}-${l.name}`} className="text-fleet-ink">
                <td className="border-b border-dotted border-fleet-border px-2 py-0.5 ps-6">{l.name}</td>
                <td className="border-b border-dotted border-fleet-border px-2 py-0.5 text-end">{formatCurrency(l.amount)}</td>
                <td colSpan={3} className="border-b border-dotted border-fleet-border" />
              </tr>
            ))}
          </Fragment>
        ))}
        <tr className="font-bold">
          <td className="px-2 py-1.5">{t("total")}</td>
          <td className="px-2 py-1.5 text-end">{formatCurrency(sum(rows, "budget"))}</td>
          <td className="px-2 py-1.5 text-end">{formatCurrency(sum(rows, "spent"))}</td>
          <td className="px-2 py-1.5 text-end">{formatCurrency(sum(rows, "budget") - sum(rows, "spent"))}</td>
          <td className="px-2 py-1.5 text-end">{pct(sum(rows, "spent"), sum(rows, "budget"))}</td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <div dir="ltr" className="hidden print:block">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {boatLogoUrl && (
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
              <Image src={boatLogoUrl} alt="" fill sizes="56px" className="object-contain" />
            </div>
          )}
          <div className="relative h-14 w-14 shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mys-logo.png" alt="" className="h-14 w-14 object-contain" />
          </div>
          <div>
            <div className="font-bold">{MYS_COMPANY_INFO.name}</div>
            <div className="text-xs text-fleet-ink">{MYS_COMPANY_INFO.tagline}</div>
          </div>
        </div>
        <div className="text-end">
          <div className="text-lg font-bold">{t("budget_report_title")}</div>
          <div className="text-xs text-fleet-ink">{boatName}</div>
          <div className="text-xs text-fleet-ink">{formatDateDisplay(todayLocalISO())}</div>
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-fleet-ink">
          {t("budget_word_annual")} {year}
        </div>
        {annual.length > 0 ? renderTable(annual) : <p className="text-xs text-fleet-ink">—</p>}
      </div>

      {separate.length > 0 && (
        <div className="mb-5 break-inside-avoid">
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-fleet-ink">
            {t("budget_separate_title")} · {t("budget_separate_note")}
          </div>
          {renderTable(separate)}
        </div>
      )}
    </div>
  );
}
