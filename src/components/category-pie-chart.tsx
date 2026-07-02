"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const PIE_COLORS = ["#0B1F38", "#4C6585", "#7A2E2E", "#1F4D3D", "#8A93A0", "#3B587A", "#A8861B"];

function formatCurrency(n: number) {
  return `₪${n.toLocaleString("he-IL")}`;
}

export function CategoryPieChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
