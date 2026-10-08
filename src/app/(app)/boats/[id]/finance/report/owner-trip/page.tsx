import Link from "next/link";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getExpenseSubcategoryLabels, getPaymentLabels } from "@/lib/labels";
import { computeOwnerTripReport } from "@/lib/owner-trip-report-data";
import { OwnerTripReportDocument } from "@/components/owner-trip-report-document";
import { PrintButton } from "@/components/print-button";
import { DateInput } from "@/components/date-input";
import { todayLocalISO } from "@/lib/date-format";
import { getTranslator } from "@/lib/i18n/locale";

export default async function OwnerTripReportPage({
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
  const subcategoryLabels = getExpenseSubcategoryLabels(locale);
  const paymentLabels = getPaymentLabels(locale);

  const today = todayLocalISO();
  const from = fromParam || `${today.slice(0, 7)}-01`;
  const to = toParam || today;

  const supabase = await createClient();
  const report = await computeOwnerTripReport(supabase, boat.id, from, to);
  const logoUrl = boat.logo_path ? supabase.storage.from("boat-photos").getPublicUrl(boat.logo_path).data.publicUrl : null;

  return (
    <div className="flex flex-col gap-4 print:block" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
      <div className="flex flex-col gap-3 print:hidden">
        <Link href={`/boats/${boat.id}/finance/report`} className="w-fit text-sm font-medium text-fleet-teal hover:underline">
          ← {t("back_to_report")}
        </Link>
        <form method="GET" className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
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
            <PrintButton locale={locale} />
          </div>
          <p className="text-xs text-fleet-ink">{t("owner_trip_report_grace_hint")}</p>
        </form>
      </div>

      <OwnerTripReportDocument
        boatName={boat.name}
        logoUrl={logoUrl}
        report={report}
        subcategoryLabels={subcategoryLabels}
        paymentLabels={paymentLabels}
        generatedOn={today}
        locale={locale}
      />
    </div>
  );
}
