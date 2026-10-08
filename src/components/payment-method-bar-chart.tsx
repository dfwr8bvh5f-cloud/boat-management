import { PAYMENT_METHOD_COLORS } from "@/lib/labels";
import { formatCurrency } from "@/lib/money";
import type { PaymentMethod } from "@/lib/types/database";

// A standalone bar chart (as opposed to PaymentMethodBreakdownBar's compact
// segmented strip embedded under a KPI tile) - every bar is direct-labeled
// with both its method name and its amount, not relying on color identity
// alone, since PAYMENT_METHOD_COLORS (already shipped elsewhere in the app -
// the MYS dashboard's own cash-vs-bank bar) falls short of ideal CVD
// separation as a standalone categorical set. Plain HTML/CSS, not an SVG
// library - same server-renderable-on-first-paint reasoning as
// CategoryPieChartFixed, since this also needs to print correctly the
// instant the page's own Print button fires.
export function PaymentMethodBarChart({
  data,
  labels,
}: {
  data: { method: PaymentMethod; sum: number }[];
  labels: Record<PaymentMethod, string>;
}) {
  const max = Math.max(1, ...data.map((d) => d.sum));

  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => (
        <div key={d.method} className="flex items-center gap-3">
          <div className="w-28 shrink-0 truncate text-xs font-medium text-fleet-ink">{labels[d.method]}</div>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-fleet-paper">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.sum / max) * 100}%`, backgroundColor: PAYMENT_METHOD_COLORS[d.method] }}
            />
          </div>
          <div className="w-24 shrink-0 text-end text-xs font-semibold text-fleet-navy whitespace-nowrap" dir="ltr">
            {formatCurrency(d.sum)}
          </div>
        </div>
      ))}
    </div>
  );
}
