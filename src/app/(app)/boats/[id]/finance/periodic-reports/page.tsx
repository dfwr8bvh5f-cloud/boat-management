import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/locale";
import { MichaliPeriodReportsList } from "@/components/michali-period-reports-list";

export default async function MichaliPeriodReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile } = await getBoatContext(id);
  const { t, locale } = await getTranslator();

  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("michali_period_reports")
    .select("*")
    .eq("boat_id", boat.id)
    .order("created_at", { ascending: false });

  const creatorIds = [...new Set((reports ?? []).map((r) => r.created_by).filter((v): v is string => Boolean(v)))];
  const { data: creators } =
    creatorIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", creatorIds) : { data: [] };
  const creatorNames = Object.fromEntries((creators ?? []).map((p) => [p.id, p.full_name ?? "—"]));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mp_report_saved_title")}</h1>
      <MichaliPeriodReportsList
        boatId={boat.id}
        reports={reports ?? []}
        creatorNames={creatorNames}
        isManagement={profile.role === "management"}
        locale={locale}
      />
    </div>
  );
}
