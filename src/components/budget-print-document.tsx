import Image from "next/image";
import { MYS_COMPANY_INFO } from "@/lib/mys-company-info";
import { formatAmount, formatCurrency } from "@/lib/money";
import { budgetColor } from "@/lib/labels";
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
  annualTotalBudget,
  annualTotalSpent,
  separate,
  locale,
}: {
  boatName: string;
  boatLogoUrl: string | null;
  year: string;
  annual: BudgetPrintRow[];
  // The same totals the budget page's navy summary block shows (spend on
  // expenses with no category yet counts in the total, so it can't be
  // re-derived from the rows).
  annualTotalBudget: number;
  annualTotalSpent: number;
  separate: BudgetPrintRow[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  // Colours must survive printing (browsers drop backgrounds by default).
  const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;
  const totalPct = annualTotalBudget ? Math.round((annualTotalSpent / annualTotalBudget) * 100) : 0;

  // Same card as BudgetCategoryCard on the budget page, read-only.
  const renderCard = (r: BudgetPrintRow) => {
    const pct = r.budget ? Math.round((r.spent / r.budget) * 100) : 0;
    return (
      <div key={r.label} className="rounded-xl border border-fleet-border bg-white p-4 print:break-inside-avoid">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-fleet-navy">{r.label}</span>
          <span className="text-sm text-fleet-ink">
            {t("budget_spent_word")} <span dir="ltr">{formatCurrency(r.spent)}</span> · {t("budget_planned_word")}{" "}
            <span dir="ltr">{formatCurrency(r.budget)}</span>
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-fleet-border" style={exact}>
          <div
            className="h-full"
            style={{ width: `${Math.min(100, pct)}%`, backgroundColor: budgetColor(r.budget ? (r.spent / r.budget) * 100 : 0), ...exact }}
          />
        </div>
        {r.budget > 0 && (
          <div className={`mt-1 text-2xs ${r.spent > r.budget ? "font-bold text-fleet-coral-text" : "text-fleet-ink"}`}>
            {pct}% {t("budget_used_pct")}
            {r.spent > r.budget && ` · ${translate(locale, "budget_over_amount", { amount: formatAmount(r.spent - r.budget) })}`}
          </div>
        )}
        {r.lines.length > 0 && (
          <div className="mt-2 flex flex-col gap-0.5 border-t border-dashed border-fleet-border pt-2">
            {r.lines.map((l) => (
              <div key={l.name} className="flex items-center justify-between text-xs text-fleet-ink">
                <span>{l.name}</span>
                <span dir="ltr">{formatCurrency(l.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="hidden print:block">
      <div dir="ltr" className="mb-6 flex flex-wrap items-start justify-between gap-4">
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

      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-fleet-navy p-4 text-white print:break-inside-avoid" style={exact}>
          <div className="text-xs opacity-80">
            {t("budget_word_annual")} {year}
          </div>
          <div className="mt-1 text-2xl font-bold">
            <span className="text-sm font-normal opacity-75">{t("budget_spent_word")} </span>
            <span dir="ltr">{formatCurrency(annualTotalSpent)}</span>{" "}
            <span className="text-sm font-normal opacity-75">
              · {t("budget_planned_word")} <span dir="ltr">{formatCurrency(annualTotalBudget)}</span>
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20" style={exact}>
            <div className="h-full" style={{ width: `${Math.min(100, totalPct)}%`, backgroundColor: budgetColor(totalPct), ...exact }} />
          </div>
          {annualTotalBudget > 0 && (
            <div className="mt-1 text-2xs opacity-80">
              {totalPct}% {t("budget_used_pct")}
            </div>
          )}
        </div>

        {separate.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="text-sm font-bold text-fleet-ink">
              {t("budget_separate_title")} <span className="text-xs font-normal text-fleet-ink">· {t("budget_separate_note")}</span>
            </div>
            {separate.map(renderCard)}
          </div>
        )}

        <div className="text-sm font-bold text-fleet-ink">{t("budget_by_category")}</div>
        <div className="flex flex-col gap-2.5">{annual.map(renderCard)}</div>
      </div>
    </div>
  );
}
