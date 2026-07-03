import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getCategoryLabels } from "@/lib/labels";
import { CategoryPieChart } from "@/components/category-pie-chart";
import { DateInput } from "@/components/date-input";
import { getTranslator } from "@/lib/i18n/locale";

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
  const { t, locale } = await getTranslator();
  const categoryLabels = getCategoryLabels(locale);

  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const from = fromParam || firstOfMonth.toISOString().slice(0, 10);
  const to = toParam || new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const [{ data: expenses }, { data: incomes }, { data: cashTx }] = await Promise.all([
    supabase
      .from("expenses")
      .select("category, amount, payment_method")
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
      .in("type", ["withdrawal", "received"])
      .gte("tx_date", from)
      .lte("tx_date", to),
  ]);

  const totalExpenses = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const totalIncome = (incomes ?? []).reduce((s, i) => s + i.amount, 0);
  const cashInflow = (cashTx ?? []).reduce((s, c) => s + c.amount, 0);
  const cashExpenses = (expenses ?? []).filter((e) => e.payment_method === "cash").reduce((s, e) => s + e.amount, 0);

  const byCategory = new Map<string, number>();
  for (const e of expenses ?? []) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }
  const categoryRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-4">
      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-xl border border-fleet-border bg-white p-4">
        <label className="flex flex-col gap-1 text-xs text-fleet-ink">
          {t("from_date")}
          <DateInput
            name="from"
            defaultValue={from}
            locale={locale}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fleet-ink">
          {t("to_date")}
          <DateInput
            name="to"
            defaultValue={to}
            locale={locale}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal"
          />
        </label>
        <button type="submit" className="rounded-lg bg-fleet-teal px-4 py-2 text-sm font-bold text-white">
          {t("report_show")}
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="text-xs text-fleet-ink">{t("income_period")}</div>
          <div className="mt-1 text-lg font-bold text-fleet-moss">{formatCurrency(totalIncome)}</div>
        </div>
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="text-xs text-fleet-ink">{t("expenses_period")}</div>
          <div className="mt-1 text-lg font-bold text-fleet-coral">{formatCurrency(totalExpenses)}</div>
        </div>
      </div>

      <div className="rounded-xl bg-fleet-navy p-4 text-white">
        <div className="text-xs opacity-80">{t("net_flow")}</div>
        <div className="mt-1 text-2xl font-bold">{formatCurrency(totalIncome - totalExpenses)}</div>
      </div>

      <div className="rounded-xl border border-fleet-border bg-white p-4">
        <div className="mb-1.5 text-xs text-fleet-ink">{t("cash_period")}</div>
        <div className="text-sm">
          {t("cash_in_period")}: {formatCurrency(cashInflow)} · {t("report_expenses_word")}: {formatCurrency(cashExpenses)}
        </div>
      </div>

      {categoryRows.length > 0 && (
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="mb-2 text-xs font-bold text-fleet-ink">{t("expenses_by_category")}</div>
          <CategoryPieChart
            data={categoryRows.map(([cat, sum]) => ({
              name: categoryLabels[cat as keyof typeof categoryLabels],
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
                  {categoryLabels[cat as keyof typeof categoryLabels]}
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
