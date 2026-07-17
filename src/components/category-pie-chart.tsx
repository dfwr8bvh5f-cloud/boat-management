"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/money";

const FALLBACK_COLORS = ["#0B1F38", "#4C6585", "#7A2E2E", "#1F4D3D", "#8A93A0", "#3B587A", "#A8861B"];

export function CategoryPieChart({
  data,
  className,
}: {
  data: { name: string; value: number; color?: string }[];
  className?: string;
}) {
  return (
    <div className={className ?? "h-56 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={entry.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
