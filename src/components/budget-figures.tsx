import { budgetColor } from "@/lib/labels";
import { getBudgetStatus } from "@/lib/budget-metrics";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

// The one column layout shared by the annual summary, the column header and
// every category card: [name] Budgeted | Actual | Difference | % Used.
// Narrow screens drop the name onto its own line and show the four figures
// in a 4-column row with a tiny label above each; from `sm` up the name is
// the first column and a single header row labels the columns. On wider
// screens the name takes the free space and the four figure columns have fixed
// widths, so the rows fill the card edge to edge and the figures stay aligned.
// Budgeted and Actual sit close together (right-aligned, tabular digits);
// Difference starts after a fixed extra gap (its cell's `sm:ps-6`).
export const BUDGET_COLUMNS = "sm:grid-cols-[minmax(0,1fr)_8rem_8rem_15rem_13rem]";
export const BUDGET_ROW_GRID = `grid grid-cols-4 gap-x-2 gap-y-1.5 ${BUDGET_COLUMNS} sm:items-center sm:gap-x-3`;

type Tone = "light" | "dark";

export function BudgetColumnHeader({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const cls = "text-2xs font-semibold uppercase tracking-wide text-fleet-ink";
  return (
    <div className={`hidden px-[13px] sm:grid sm:px-[17px] ${BUDGET_ROW_GRID}`} aria-hidden="true">
      <span />
      <span className={`${cls} text-right`}>{t("budget_col_budgeted")}</span>
      <span className={`${cls} text-right`}>{t("budget_col_actual")}</span>
      <span className={`${cls} sm:ps-6`}>{t("budget_col_difference")}</span>
      <span className={cls}>{t("budget_col_pct_used")}</span>
    </div>
  );
}

// Renders the four figure cells (as grid children - put it inside an element
// using BUDGET_ROW_GRID). `labels="always"` keeps the per-cell label visible
// at every width (annual summary); otherwise labels only show on narrow
// screens, where there is no header row.
export function BudgetFigures({
  budgeted,
  spent,
  locale,
  tone = "light",
  labels = "narrow",
}: {
  budgeted: number;
  spent: number;
  locale: Locale;
  tone?: Tone;
  labels?: "narrow" | "always";
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const status = getBudgetStatus(budgeted, spent);
  const dark = tone === "dark";

  const labelCls = `${labels === "always" ? "block" : "block sm:hidden"} text-2xs ${dark ? "text-white/70" : "text-fleet-ink"}`;
  const valueCls = dark ? "text-white" : "text-fleet-navy";
  const mutedCls = dark ? "text-white/70" : "text-fleet-ink";
  const overCls = dark ? "text-fleet-coral" : "text-fleet-coral-text";
  const okCls = dark ? "text-fleet-moss" : "text-fleet-moss-text";

  // "€655.19 over budget": the amount carries the weight, the wording
  // ("remaining" / "over budget") is lighter. The translated phrase is split
  // around the amount so every locale keeps its own word order.
  const diffPhrase = (key: Parameters<typeof translate>[1], amount: number) => {
    const [before, after = ""] = translate(locale, key, { amount: "\u0000" }).split("\u0000");
    return (
      <>
        {before}
        <span className="font-semibold tabular-nums">{formatCurrency(amount)}</span>
        <span className="font-normal">{after}</span>
      </>
    );
  };
  let diff: React.ReactNode;
  if (status.kind === "under") {
    diff = <span className={okCls}>{diffPhrase("budget_diff_remaining", status.diff)}</span>;
  } else if (status.kind === "over") {
    diff = <span className={overCls}>{diffPhrase("budget_diff_over", status.diff)}</span>;
  } else if (status.kind === "on") {
    diff = <span className={mutedCls}>{t("budget_on_budget")}</span>;
  } else {
    diff = <span className={mutedCls}>—</span>;
  }

  const over = status.kind === "over";
  const barColor = budgetColor(status.rawPct);

  return (
    <>
      <div className="min-w-0">
        <span className={`${labelCls} text-right`}>{t("budget_col_budgeted")}</span>
        <span dir="ltr" className={`block text-right text-sm tabular-nums ${valueCls}`}>
          {formatCurrency(budgeted)}
        </span>
      </div>
      <div className="min-w-0">
        <span className={`${labelCls} text-right`}>{t("budget_col_actual")}</span>
        <span dir="ltr" className={`block text-right text-sm font-semibold tabular-nums ${valueCls}`}>
          {formatCurrency(spent)}
        </span>
      </div>
      <div className="min-w-0 text-xs leading-tight ps-1.5 sm:ps-6 sm:text-sm sm:leading-normal">
        <span className={labelCls}>{t("budget_col_difference")}</span>
        {/* The amount sits inside a translated phrase ("€655.19 over
            budget"); isolate it so RTL bidi keeps the euro sign and digits
            together. */}
        <bdi className="block">{diff}</bdi>
      </div>
      <div className="min-w-0">
        <span className={labelCls}>{t("budget_col_pct_used")}</span>
        {status.pct == null ? (
          <span className={`block text-xs leading-tight ${status.kind === "no_budget" ? `font-semibold ${overCls}` : mutedCls}`}>
            {status.kind === "no_budget" ? t("budget_no_budget_set") : "—"}
          </span>
        ) : (
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span
              dir="ltr"
              className={`shrink-0 text-start text-sm font-bold tabular-nums sm:min-w-[3.25rem] sm:text-base ${over ? overCls : valueCls}`}
            >
              {status.pct}%
            </span>
            <div className={`h-1.5 w-full overflow-hidden rounded-full sm:flex-1 ${dark ? "bg-white/20" : "bg-fleet-border"}`}>
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, status.pct)}%`,
                  backgroundColor: barColor,
                  WebkitPrintColorAdjust: "exact",
                  printColorAdjust: "exact",
                }}
                role="presentation"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
