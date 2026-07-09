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
  const [{ data: weeklyReport }, { data: pastReports }] = await Promise.all([
    supabase.from("weekly_engine_reports").select("*").eq("boat_id", boat.id).eq("week_of", weekOf).maybeSingle(),
    supabase
      .from("weekly_engine_reports")
      .select("*")
      .eq("boat_id", boat.id)
      .neq("week_of", weekOf)
      .order("week_of", { ascending: false }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <WeeklyEngineReportForm boatId={boat.id} weekOf={weekOf} existing={weeklyReport ?? null} canEdit={canEdit} locale={locale} />
      <WeeklyEngineReportHistory reports={pastReports ?? []} locale={locale} />
    </div>
  );
}
