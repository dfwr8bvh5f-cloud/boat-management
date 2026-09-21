import { formatCurrency } from "@/lib/money";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import type { MichaliPeriodReportLabels } from "@/lib/michali-period-report";
import type { MichaliPeriodReportSnapshot } from "@/lib/types/database";

// The PDF the "Download" button produces is just the browser's own
// print-to-PDF (the app has no PDF library anywhere - window.print() plus
// print: Tailwind variants is the established pattern, see expenses-manager
// and finance/report/page.tsx). This renders as a structured report -
// section per category, each with its own line items and subtotal, then a
// grand total/per-cabin summary - matching the live panel's own layout,
// not a flat list of every expense. Never shown on screen (only inside a
// `hidden print:block` wrapper), so no `print:` variants are needed here.
function Section({ title, total, children }: { title: string; total: number; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="mb-1.5 border-b border-black pb-1 text-sm font-bold uppercase tracking-wide">{title}</h2>
      <div className="flex flex-col gap-0.5 text-sm">{children}</div>
      <div className="mt-1 flex items-center justify-between border-t border-gray-300 pt-1 text-sm font-bold">
        <span>Total</span>
        <span dir="ltr">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

function Line({ label, amount, note }: { label: string; amount: number; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 flex-1">
        {label}
        {note && <span className="text-gray-500"> — {note}</span>}
      </span>
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
  return (
    <div className="p-8 text-black">
      <div className="mb-6 flex items-end justify-between border-b-2 border-black pb-3">
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

      <Section title={labels.fuel} total={snapshot.fuel.total}>
        <Line label={`${snapshot.fuel.liters}L x €${snapshot.fuel.pricePerLiter}`} amount={snapshot.fuel.total} />
      </Section>

      <Section title={labels.boatService} total={snapshot.boatService.total}>
        <Line label={labels.laundry} amount={snapshot.boatService.laundry} />
        <Line label={labels.service} amount={snapshot.boatService.service} />
        <Line label={labels.transfers} amount={snapshot.boatService.transfers} />
        <Line label={labels.toiletries} amount={snapshot.boatService.toiletries} />
      </Section>

      <Section title={labels.provisions} total={snapshot.provisions.total}>
        <Line label={labels.shopping} amount={snapshot.provisions.buckets.shopping} />
        <Line label={labels.meat} amount={snapshot.provisions.buckets.meat} />
        <Line label={labels.drinks} amount={snapshot.provisions.buckets.drinks} />
        <Line label={labels.fish} amount={snapshot.provisions.buckets.fish} />
        {snapshot.provisions.unassigned > 0 && <Line label={labels.unassigned} amount={snapshot.provisions.unassigned} />}
      </Section>

      <Section title={labels.docking} total={snapshot.docking.total}>
        {snapshot.docking.lines.map((l, i) => (
          <Line key={i} label={l.description} amount={l.amount} />
        ))}
      </Section>

      <div className="mt-6 flex flex-col gap-2 border-t-2 border-black pt-3">
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
