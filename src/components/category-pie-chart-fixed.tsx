"use client";

import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/money";

// Fixed pixel size, not the shared CategoryPieChart's ResponsiveContainer -
// this exists specifically for FinancialReportDocument, which (via
// ReportsManager's saved-report download button) can render inside a
// `hidden` (display:none) portal until print media flips it visible.
// ResponsiveContainer measures its parent at mount time, before that flip
// ever happens, so it always renders at 0x0 there (same issue already
// solved the same way in michali-period-report-print-view.tsx). A fixed
// width/height SVG needs no such measurement, so it renders correctly
// whether or not it's currently visible on screen.
export function CategoryPieChartFixed({
  data,
  size = 256,
}: {
  data: { name: string; value: number; color?: string }[];
  size?: number;
}) {
  return (
    // innerRadius/outerRadius kept as the same fixed 50/80 px the shared
    // CategoryPieChart already draws (those are absolute pixel radii in
    // recharts, not proportional to the container) - the default size=256
    // here matches the h-64 w-64 box FinancialReportDocument previously
    // rendered it in, so this looks pixel-identical to before.
    <PieChart width={size} height={size}>
      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
        {data.map((entry) => (
          <Cell key={entry.name} fill={entry.color} />
        ))}
      </Pie>
      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
    </PieChart>
  );
}
