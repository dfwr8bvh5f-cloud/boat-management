import { budgetColor } from "@/lib/labels";

function formatCurrency(n: number) {
  return `€${n.toLocaleString("he-IL")}`;
}

export function BudgetStatusTable({
  rows,
  totalBudget,
  totalSpent,
  labels,
}: {
  rows: { label: string; budget: number; spentYtd: number }[];
  totalBudget: number;
  totalSpent: number;
  labels: { type: string; pct: string; budget: string; ytd: string; total: string };
}) {
  const totalPct = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0;
  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-fleet-border text-start text-fleet-ink">
            <th className="py-1.5 pe-2 text-start font-semibold">{labels.type}</th>
            <th className="w-1/2 py-1.5 pe-2 text-start font-semibold">{labels.pct}</th>
            <th className="py-1.5 pe-2 text-end font-semibold">{labels.budget}</th>
            <th className="py-1.5 text-end font-semibold">{labels.ytd}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = r.budget ? Math.round((r.spentYtd / r.budget) * 100) : 0;
            return (
              <tr key={r.label} className="border-b border-dotted border-fleet-border print:break-inside-avoid">
                <td className="py-1.5 pe-2">{r.label}</td>
                <td className="py-1.5 pe-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-fleet-border">
                      <div
                        className="h-full"
                        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: budgetColor(pct) }}
                      />
                    </div>
                    <span>{pct}%</span>
                  </div>
                </td>
                <td className="py-1.5 pe-2 text-end">{formatCurrency(r.budget)}</td>
                <td className="py-1.5 text-end">{formatCurrency(r.spentYtd)}</td>
              </tr>
            );
          })}
          <tr className="font-bold print:break-inside-avoid">
            <td className="py-1.5 pe-2">{labels.total}</td>
            <td className="py-1.5 pe-2">
              <div className="flex items-center gap-1.5">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-fleet-border">
                  <div
                    className="h-full"
                    style={{ width: `${Math.min(100, totalPct)}%`, backgroundColor: budgetColor(totalPct) }}
                  />
                </div>
                <span>{totalPct}%</span>
              </div>
            </td>
            <td className="py-1.5 pe-2 text-end">{formatCurrency(totalBudget)}</td>
            <td className="py-1.5 text-end">{formatCurrency(totalSpent)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
