import { PAYMENT_METHOD_COLORS } from "@/lib/labels";
import { formatCurrency } from "@/lib/money";
import type { PaymentMethod } from "@/lib/types/database";

// Compact cash-vs-bank(-vs-other) segmented bar embedded under a KPI stat
// tile - not a standalone chart, so it skips a full legend/tooltip layer in
// favor of a native `title` per segment; the MYS dashboard's shared legend
// (src/app/(app)/mys/page.tsx) is what keeps identity from being color-alone.
export function PaymentMethodBreakdownBar({
  segments,
  labels,
}: {
  segments: { method: PaymentMethod; amount: number }[];
  labels: Record<PaymentMethod, string>;
}) {
  const visible = segments.filter((s) => s.amount > 0);
  const total = visible.reduce((s, seg) => s + seg.amount, 0);
  if (total <= 0) return null;

  return (
    <div className="mt-2 flex h-2 gap-[2px]">
      {visible.map((seg) => (
        <div
          key={seg.method}
          title={`${labels[seg.method]}: ${formatCurrency(seg.amount)}`}
          className="h-full first:rounded-s-full last:rounded-e-full"
          style={{ width: `${(seg.amount / total) * 100}%`, backgroundColor: PAYMENT_METHOD_COLORS[seg.method] }}
        />
      ))}
    </div>
  );
}
