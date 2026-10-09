import { SegLink } from "@/components/seg-link";
import { getTranslator } from "@/lib/i18n/locale";

// Two-way switch shown at the top of both Financial Reports pages (the
// period report and the owner-trip report) - same segmented look as the
// Finance section's own tab strip.
export async function FinancialReportSwitch({ boatId }: { boatId: string }) {
  const { t } = await getTranslator();
  return (
    <div className="flex w-fit snap-x gap-1 overflow-x-auto rounded-xl bg-fleet-tabs p-1 print:hidden">
      <SegLink href={`/boats/${boatId}/finance/report`} label={t("fin_report_type_period")} />
      <SegLink href={`/boats/${boatId}/finance/report/owner-trip`} label={t("fin_report_type_owner_trip")} />
    </div>
  );
}
