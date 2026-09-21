import { formatCurrency } from "@/lib/money";

// The PDF the "Download" button produces is just the browser's own
// print-to-PDF (the app has no PDF library anywhere - window.print() plus
// print: Tailwind variants is the established pattern, see expenses-manager
// and finance/report/page.tsx). This is the plain, printer-friendly table
// that gets shown for that - not meant to be seen on screen.
export function MichaliPeriodReportPrintView({
  title,
  periodLabel,
  rows,
  categoryLabel,
  descriptionLabel,
  amountLabel,
}: {
  title: string;
  periodLabel: string | null;
  rows: (string | number)[][];
  categoryLabel: string;
  descriptionLabel: string;
  amountLabel: string;
}) {
  return (
    <div className="p-8 text-black">
      <h1 className="mb-1 text-2xl font-bold">{title}</h1>
      {periodLabel && (
        <div className="mb-4 text-sm" dir="ltr">
          {periodLabel}
        </div>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-start text-xs font-semibold uppercase">
            <th className="py-2 pe-3 text-start">{categoryLabel}</th>
            <th className="py-2 pe-3 text-start">{descriptionLabel}</th>
            <th className="py-2 text-end">{amountLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-300">
              <td className="py-1.5 pe-3">{r[0]}</td>
              <td className="py-1.5 pe-3">{r[1]}</td>
              <td className="py-1.5 text-end font-medium" dir="ltr">
                {formatCurrency(Number(r[2]))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
