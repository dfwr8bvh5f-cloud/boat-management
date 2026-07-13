import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { WeeklyEngineReportForm } from "@/components/weekly-engine-report-form";
import { WeeklyEngineReportHistory } from "@/components/weekly-engine-report-history";
import { currentReportWeekFriday } from "@/lib/date-format";
import { getLocale } from "@/lib/i18n/locale";

export default async function TechnicalReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const weekOf = currentReportWeekFriday();
  const [{ data: machineSpecsRaw }, { data: weeklyReport }, { data: allReports }] = await Promise.all([
    supabase
      .from("technical_specs")
      .select("id, name")
      .eq("boat_id", boat.id)
      .eq("category", "machine")
      .eq("status", "approved")
      .order("name"),
    supabase.from("weekly_engine_reports").select("*").eq("boat_id", boat.id).eq("week_of", weekOf).maybeSingle(),
    // Includes the current week too, so a just-saved report shows up in the
    // list below right away instead of only appearing once a new week starts.
    supabase
      .from("weekly_engine_reports")
      .select("*")
      .eq("boat_id", boat.id)
      .order("week_of", { ascending: false }),
  ]);

  // Gearbox hours aren't tracked in the weekly report - it still shows up
  // in Technical Specs (Maintenance > Specs) like any other machine, just
  // excluded from this specific hours form.
  const machineSpecs = (machineSpecsRaw ?? []).filter((s) => s.name.trim().toLowerCase() !== "gearbox");
  const reportIds = [weeklyReport?.id, ...(allReports ?? []).map((r) => r.id)].filter((id): id is string => Boolean(id));
  const { data: allEntries } =
    reportIds.length > 0
      ? await supabase.from("weekly_engine_report_entries").select("*").in("report_id", reportIds)
      : { data: [] };

  const entriesByReportId = new Map<string, Record<string, number>>();
  for (const e of allEntries ?? []) {
    if (e.hours == null) continue;
    const forReport = entriesByReportId.get(e.report_id) ?? {};
    forReport[e.technical_spec_id] = e.hours;
    entriesByReportId.set(e.report_id, forReport);
  }

  return (
    <div className="flex flex-col gap-4">
      <WeeklyEngineReportForm
        boatId={boat.id}
        weekOf={weekOf}
        existing={weeklyReport ?? null}
        entriesBySpecId={weeklyReport ? (entriesByReportId.get(weeklyReport.id) ?? {}) : {}}
        machineSpecs={machineSpecs}
        canEdit={canEdit}
        locale={locale}
      />
      <WeeklyEngineReportHistory
        boatId={boat.id}
        reports={allReports ?? []}
        entriesByReportId={entriesByReportId}
        machineSpecs={machineSpecs}
        canEdit={canEdit}
        locale={locale}
      />
    </div>
  );
}
