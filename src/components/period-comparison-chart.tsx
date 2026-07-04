"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

function formatCurrency(n: number) {
  return `€${n.toLocaleString("he-IL")}`;
}

export function PeriodComparisonChart({
  data,
  currentLabel,
  previousLabel,
}: {
  data: { name: string; current: number; previous: number }[];
  currentLabel: string;
  previousLabel: string;
}) {
  const height = Math.max(180, data.length * 28);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={(v) => formatCurrency(Number(v))} fontSize={11} />
          <YAxis type="category" dataKey="name" width={110} fontSize={11} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Legend />
          <Bar dataKey="current" name={currentLabel} fill="#1F4D3D" />
          <Bar dataKey="previous" name={previousLabel} fill="#C8D9CC" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
