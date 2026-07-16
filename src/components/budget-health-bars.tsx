import { budgetColor } from "@/lib/labels";

function formatCurrency(n: number) {
  return `${n < 0 ? "-" : ""}€${Math.abs(n).toLocaleString("he-IL")}`;
}

export function BudgetHealthBars({
  rows,
  overBudgetLabel,
}: {
  rows: { label: string; budget: number; spentYtd: number }[];
  overBudgetLabel: string;
}) {
  const withBudget = rows.filter((r) => r.budget > 0);

  return (
    <div className="flex flex-col gap-5">
      {withBudget.map((r) => {
        const pct = Math.round((r.spentYtd / r.budget) * 100);
        const over = r.spentYtd > r.budget;
        return (
          <div key={r.label} className="flex flex-col gap-1.5 print:break-inside-avoid">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-fleet-navy">{r.label}</span>
              <span className={over ? "font-semibold text-fleet-coral" : "text-fleet-ink"}>
                <span dir="ltr">
                  {formatCurrency(r.spentYtd)} / {formatCurrency(r.budget)}
                </span>
                {over && <span className="ms-2 text-xs">({overBudgetLabel})</span>}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-fleet-paper">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, pct)}%`,
                  backgroundColor: budgetColor(pct),
                  WebkitPrintColorAdjust: "exact",
                  printColorAdjust: "exact",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
