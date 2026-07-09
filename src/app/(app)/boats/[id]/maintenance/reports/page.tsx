import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { ReportsManager } from "@/components/reports-manager";
import { WeeklyEngineReportForm } from "@/components/weekly-engine-report-form";
import { currentReportWeekFriday } from "@/lib/date-format";
import { getLocale } from "@/lib/i18n/locale";

export default async function TechnicalReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const weekOf = currentReportWeekFriday();
  const [{ data: reports }, { data: weeklyReport }] = await Promise.all([
    supabase.from("reports").select("*").eq("boat_id", boat.id).eq("type", "technical").order("issued_at", { ascending: false }),
    supabase.from("weekly_engine_reports").select("*").eq("boat_id", boat.id).eq("week_of", weekOf).maybeSingle(),
  ]);

  const issuerIds = [...new Set((reports ?? []).map((r) => r.issued_by).filter((id): id is string => Boolean(id)))];
  const { data: issuers } =
    issuerIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", issuerIds)
      : { data: [] };

  const issuerNames = Object.fromEntries((issuers ?? []).map((p) => [p.id, p.full_name ?? "—"]));

  return (
    <div className="flex flex-col gap-4">
      <WeeklyEngineReportForm boatId={boat.id} weekOf={weekOf} existing={weeklyReport ?? null} canEdit={canEdit} locale={locale} />
      <ReportsManager
        boatId={boat.id}
        reports={reports ?? []}
        reportType="technical"
        issuerNames={issuerNames}
        isManagement={profile.role === "management"}
        locale={locale}
      />
    </div>
  );
}
