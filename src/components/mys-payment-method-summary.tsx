import { ReportKpiCard } from "@/components/report-kpi-card";
import { PaymentMethodBreakdownBar } from "@/components/payment-method-breakdown-bar";
import { getPaymentLabels, PAYMENT_METHOD_COLORS, PAYMENT_METHODS } from "@/lib/labels";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { PaymentMethod } from "@/lib/types/database";

type Breakdown = { method: PaymentMethod; amount: number }[];

// This month/this year totals + their payment-method split - used to live
// on the /mys dashboard itself as a footer under each KPI tile, but moved
// here (onto /mys/income and /mys/expenses, the pages those tiles already
// link to) so the dashboard's own tiles could shrink down to a plain
// number each, per her request.
export function MysPaymentMethodSummary({
  monthLabel,
  monthTotal,
  monthBreakdown,
  yearLabel,
  yearTotal,
  yearBreakdown,
  tone,
  locale,
}: {
  monthLabel: string;
  monthTotal: number;
  monthBreakdown: Breakdown;
  yearLabel: string;
  yearTotal: number;
  yearBreakdown: Breakdown;
  tone: "positive" | "negative";
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const paymentLabels = getPaymentLabels(locale);
  const hasAnyBreakdown = [...monthBreakdown, ...yearBreakdown].some((seg) => seg.amount > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <ReportKpiCard label={monthLabel} value={formatCurrency(monthTotal)} tone={tone} footer={<PaymentMethodBreakdownBar segments={monthBreakdown} labels={paymentLabels} />} />
        <ReportKpiCard label={yearLabel} value={formatCurrency(yearTotal)} tone={tone} footer={<PaymentMethodBreakdownBar segments={yearBreakdown} labels={paymentLabels} />} />
      </div>
      {hasAnyBreakdown && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-fleet-ink">
          <span className="font-medium">{t("payment_method")}:</span>
          {PAYMENT_METHODS.map((method) => (
            <span key={method} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PAYMENT_METHOD_COLORS[method] }} />
              {paymentLabels[method]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
