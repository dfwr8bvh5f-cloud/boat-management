"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/money";

export function ReportBarChart({
  data,
  xKey,
  series,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: { key: string; label: string; color: string }[];
}) {
  return (
    <div className="mx-auto h-72 w-full max-w-lg" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#e3e6ec" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#5b6472" }} axisLine={{ stroke: "#e3e6ec" }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#5b6472" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatCurrency(Number(v))}
            width={64}
          />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={40} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
