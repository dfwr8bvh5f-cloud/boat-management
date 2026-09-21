import { CategoryPieChart } from "@/components/category-pie-chart";
import { formatCurrency } from "@/lib/money";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { PROVISIONS_BUCKETS, type MichaliPeriodReportLabels } from "@/lib/michali-period-report";
import type { MichaliPeriodReportSnapshot } from "@/lib/types/database";

const CHART_COLORS = { fuel: "#0b1f38", boatService: "#4c6585", provisions: "#c98787", docking: "#78bb7a" };

// The PDF the "Download" button produces is just the browser's own
// print-to-PDF (the app has no PDF library anywhere - window.print() plus
// print: Tailwind variants is the established pattern, see expenses-manager
// and finance/report/page.tsx). Mirrors the live panel's own content in
// full (per her screenshots) - every section's line items, not just
// totals - never shown on screen itself (only inside a `hidden print:block`
// wrapper), so no `print:` variants are needed here.
function Section({ title, total, totalLabel, children }: { title: string; total: number; totalLabel: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="mb-1.5 border-b border-black pb-1 text-sm font-bold uppercase tracking-wide">{title}</h2>
      <div className="flex flex-col gap-1.5 text-sm">{children}</div>
      <div className="mt-1 flex items-center justify-between border-t border-gray-300 pt-1 text-sm font-bold">
        <span>{totalLabel}</span>
        <span dir="ltr">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

function Line({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 flex-1">{label}</span>
      <span dir="ltr" className="shrink-0">
        {formatCurrency(amount)}
      </span>
    </div>
  );
}

export function MichaliPeriodReportPrintView({
  title,
  periodLabel,
  snapshot,
  labels,
}: {
  title: string;
  periodLabel: string | null;
  snapshot: MichaliPeriodReportSnapshot;
  labels: MichaliPeriodReportLabels;
}) {
  const chartData = [
    { name: labels.fuel, value: snapshot.fuel.total, color: CHART_COLORS.fuel },
    { name: labels.boatService, value: snapshot.boatService.total, color: CHART_COLORS.boatService },
    { name: labels.provisions, value: snapshot.provisions.total, color: CHART_COLORS.provisions },
    { name: labels.docking, value: snapshot.docking.total, color: CHART_COLORS.docking },
  ].filter((d) => d.value > 0);

  return (
    <div className="p-8 text-black">
      <div className="mb-5 flex items-end justify-between border-b-2 border-black pb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">MYS FLEET</div>
          <h1 className="mt-0.5 text-2xl font-bold">{title}</h1>
          {periodLabel && (
            <div className="mt-1 text-sm text-gray-600" dir="ltr">
              {periodLabel}
            </div>
          )}
        </div>
        <div className="text-end text-xs text-gray-500" dir="ltr">
          {formatDateDisplay(todayLocalISO())}
        </div>
      </div>

      {snapshot.cabinCount > 0 && (
        <div className="mb-5 flex items-center justify-between text-sm">
          <span className="font-semibold">{labels.cabinCount}</span>
          <span>{snapshot.cabinCount}</span>
        </div>
      )}

      <Section title={labels.fuel} total={snapshot.fuel.total} totalLabel={labels.total}>
        <div className="flex items-center justify-between">
          <span>{labels.fuelLiters}</span>
          <span>{snapshot.fuel.liters}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>{labels.fuelPrice}</span>
          <span dir="ltr">{formatCurrency(snapshot.fuel.pricePerLiter)}</span>
        </div>
      </Section>

      <Section title={labels.boatService} total={snapshot.boatService.total} totalLabel={labels.total}>
        <Line label={labels.laundry} amount={snapshot.boatService.laundry} />
        <Line label={labels.service} amount={snapshot.boatService.service} />
        <Line label={labels.transfers} amount={snapshot.boatService.transfers} />
        <Line label={labels.toiletries} amount={snapshot.boatService.toiletries} />
      </Section>

      <Section title={labels.provisions} total={snapshot.provisions.total} totalLabel={labels.total}>
        {PROVISIONS_BUCKETS.map((b) => {
          const items = snapshot.provisions.lines.filter((l) => l.bucket === b);
          if (items.length === 0) return null;
          return (
            <div key={b}>
              <div className="flex items-center justify-between font-medium">
                <span>{labels[b]}</span>
                <span dir="ltr">{formatCurrency(snapshot.provisions.buckets[b])}</span>
              </div>
              <div className="text-xs text-gray-500">{items.map((l) => `${l.description} — ${formatCurrency(l.amount)}`).join(", ")}</div>
            </div>
          );
        })}
        {snapshot.provisions.unassigned > 0 && <Line label={labels.unassigned} amount={snapshot.provisions.unassigned} />}
      </Section>

      <Section title={labels.docking} total={snapshot.docking.total} totalLabel={labels.total}>
        {snapshot.docking.lines.map((l, i) => (
          <Line key={i} label={l.description} amount={l.amount} />
        ))}
      </Section>

      {chartData.length > 0 && (
        <div className="mb-6 flex flex-col items-center gap-3">
          <CategoryPieChart data={chartData} className="h-56 w-56" />
          <div className="flex w-full flex-col gap-1">
            {chartData.map((d) => (
              <div key={d.name} className="flex items-center gap-2 border-b border-dotted border-gray-300 py-1 text-sm">
                <span className="flex flex-1 items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span dir="ltr" className="font-medium">
                  {formatCurrency(d.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t-2 border-black pt-3">
        <div className="flex items-center justify-between text-lg font-bold">
          <span>{labels.grandTotal}</span>
          <span dir="ltr">{formatCurrency(snapshot.grandTotal)}</span>
        </div>
        {snapshot.perCabin != null && (
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>{labels.perCabin}</span>
            <span dir="ltr">{formatCurrency(snapshot.perCabin)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
