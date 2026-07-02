import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABELS } from "@/lib/labels";
import { CategoryPieChart } from "@/components/category-pie-chart";

const PIE_COLORS = ["#0B1F38", "#4C6585", "#7A2E2E", "#1F4D3D", "#8A93A0", "#3B587A", "#A8861B"];

function formatCurrency(n: number) {
  return `€${n.toLocaleString("he-IL")}`;
}

export default async function PeriodReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { boat } = await getBoatContext(id);
  const { from: fromParam, to: toParam } = await searchParams;

  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const from = fromParam || firstOfMonth.toISOString().slice(0, 10);
  const to = toParam || new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const [{ data: expenses }, { data: incomes }, { data: cashTx }] = await Promise.all([
    supabase
      .from("expenses")
      .select("category, amount")
      .eq("boat_id", boat.id)
      .eq("status", "approved")
      .gte("expense_date", from)
      .lte("expense_date", to),
    supabase
      .from("incomes")
      .select("amount")
      .eq("boat_id", boat.id)
      .eq("status", "approved")
      .eq("type", "actual")
      .gte("income_date", from)
      .lte("income_date", to),
    supabase
      .from("cash_transactions")
      .select("type, amount")
      .eq("boat_id", boat.id)
      .eq("status", "approved")
      .gte("tx_date", from)
      .lte("tx_date", to),
  ]);

  const totalExpenses = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const totalIncome = (incomes ?? []).reduce((s, i) => s + i.amount, 0);
  const cashWithdrawals = (cashTx ?? []).filter((c) => c.type === "withdrawal").reduce((s, c) => s + c.amount, 0);
  const cashUsage = (cashTx ?? []).filter((c) => c.type === "usage").reduce((s, c) => s + c.amount, 0);

  const byCategory = new Map<string, number>();
  for (const e of expenses ?? []) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }
  const categoryRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-4">
      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-xl border border-fleet-border bg-white p-4">
        <label className="flex flex-col gap-1 text-xs text-fleet-ink">
          מתאריך
          <input type="date" name="from" defaultValue={from} className="rounded-lg border border-fleet-border px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fleet-ink">
          עד תאריך
          <input type="date" name="to" defaultValue={to} className="rounded-lg border border-fleet-border px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-lg bg-fleet-teal px-4 py-2 text-sm font-bold text-white">
          הצג
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="text-xs text-fleet-ink">הכנסות בתקופה</div>
          <div className="mt-1 text-lg font-bold text-fleet-moss">{formatCurrency(totalIncome)}</div>
        </div>
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="text-xs text-fleet-ink">הוצאות בתקופה</div>
          <div className="mt-1 text-lg font-bold text-fleet-coral">{formatCurrency(totalExpenses)}</div>
        </div>
      </div>

      <div className="rounded-xl bg-fleet-navy p-4 text-white">
        <div className="text-xs opacity-80">תזרים נטו (הכנסות פחות הוצאות)</div>
        <div className="mt-1 text-2xl font-bold">{formatCurrency(totalIncome - totalExpenses)}</div>
      </div>

      <div className="rounded-xl border border-fleet-border bg-white p-4">
        <div className="mb-1.5 text-xs text-fleet-ink">תנועות מזומן בתקופה</div>
        <div className="text-sm">
          משיכות: {formatCurrency(cashWithdrawals)} · שימוש: {formatCurrency(cashUsage)}
        </div>
      </div>

      {categoryRows.length > 0 && (
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="mb-2 text-xs font-bold text-fleet-ink">סה״כ הוצאות לפי קטגוריה</div>
          <CategoryPieChart
            data={categoryRows.map(([cat, sum]) => ({
              name: CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS],
              value: sum,
            }))}
          />
          <div className="mt-2 flex flex-col gap-1">
            {categoryRows.map(([cat, sum], index) => (
              <div key={cat} className="flex items-center justify-between border-b border-dotted border-fleet-border py-1.5 text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                  />
                  {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}
                </span>
                <span className="font-medium">{formatCurrency(sum)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
