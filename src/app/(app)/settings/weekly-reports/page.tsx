import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/locale";
import { currentReportWeekThursday, formatDateDisplay } from "@/lib/date-format";
import { hoursUntilService, isServiceTrackedMachine, serviceStatus } from "@/lib/engine-service";
import { SettingsSubpageHeader } from "@/components/settings/settings-subpage-header";

// Management only: this week's weekly report for every boat in one place. A
// boat with no report for the current week is shown in red with "Weekly report
// not submitted this week" (the same week the Thursday/Friday reminders use).
export default async function SettingsWeeklyReportsPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/settings");

  const { t } = await getTranslator();
  const supabase = await createClient();
  const weekOf = currentReportWeekThursday();

  const [{ data: boats }, { data: reports, error: reportsError }] = await Promise.all([
    supabase.from("boats").select("id, name").neq("boat_type", "for_sale").neq("status", "inactive").order("name"),
    supabase.from("weekly_engine_reports").select("*").eq("week_of", weekOf),
  ]);
  if (reportsError) console.error("settings/weekly-reports: reports query failed:", reportsError.message);

  const reportIds = (reports ?? []).map((r) => r.id);
  const { data: entries } =
    reportIds.length > 0 ? await supabase.from("weekly_engine_report_entries").select("report_id, technical_spec_id, hours").in("report_id", reportIds) : { data: [] };
  const specIds = [...new Set((entries ?? []).map((e) => e.technical_spec_id))];
  const { data: specs } = specIds.length > 0 ? await supabase.from("technical_specs").select("id, name").in("id", specIds) : { data: [] };
  const specNameById = new Map((specs ?? []).map((s) => [s.id, s.name]));

  const reportByBoatId = new Map((reports ?? []).map((r) => [r.boat_id, r]));
  const rows = (boats ?? [])
    .map((b) => {
      const report = reportByBoatId.get(b.id) ?? null;
      const machines = report
        ? (entries ?? [])
            .filter((e) => e.report_id === report.id && e.hours != null)
            .map((e) => ({ name: specNameById.get(e.technical_spec_id) ?? "", hours: e.hours as number }))
            .sort((a, c) => a.name.localeCompare(c.name))
        : [];
      return { boat: b, report, machines };
    })
    // Boats still missing their report first.
    .sort((a, b) => Number(Boolean(a.report)) - Number(Boolean(b.report)) || a.boat.name.localeCompare(b.boat.name));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <SettingsSubpageHeader title={t("settings_weekly_reports_row")} backLabel={t("nav_settings")} />
      <p className="text-xs text-fleet-ink">
        {t("weekly_report_week_of")} <span dir="ltr">{formatDateDisplay(weekOf)}</span>
      </p>

      <div className="flex flex-col gap-2.5">
        {rows.map(({ boat, report, machines }) => (
          <Link
            key={boat.id}
            href={`/boats/${boat.id}/maintenance/reports`}
            className={`flex flex-col gap-2 rounded-xl border p-3 hover:shadow-sm ${
              report ? "border-fleet-border bg-white" : "border-fleet-coral bg-fleet-coral/5"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`font-brand font-bold ${report ? "text-fleet-navy" : "text-fleet-coral-text"}`}>{boat.name}</span>
              {!report && <span className="text-xs font-bold text-fleet-coral-text">{t("weekly_report_not_submitted_this_week")}</span>}
            </div>

            {report && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                {machines.map((m) => {
                  const tracked = isServiceTrackedMachine(m.name);
                  const remaining = tracked ? hoursUntilService(m.hours) : null;
                  const urgent = tracked && serviceStatus(m.hours) != null;
                  return (
                    <div key={m.name}>
                      <dt className="text-2xs text-fleet-ink">{m.name}</dt>
                      <dd className="font-medium text-fleet-navy">{m.hours}</dd>
                      {remaining != null && (
                        <dd className={`text-2xs ${urgent ? "font-semibold text-fleet-coral-text" : "text-fleet-ink"}`}>
                          {remaining === 0 ? t("weekly_service_due") : t(urgent ? "weekly_service_soon" : "weekly_service_remaining", { hours: remaining })}
                        </dd>
                      )}
                    </div>
                  );
                })}
                {report.fuel_status && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-2xs text-fleet-ink">{t("weekly_fuel_status")}</dt>
                    <dd className="font-medium text-fleet-navy">{report.fuel_status}</dd>
                  </div>
                )}
                {report.notes && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-2xs text-fleet-ink">{t("notes_field")}</dt>
                    <dd className="font-medium text-fleet-navy">{report.notes}</dd>
                  </div>
                )}
              </dl>
            )}
          </Link>
        ))}
        {rows.length === 0 && <p className="text-sm text-fleet-ink">{t("no_boats")}</p>}
      </div>
    </div>
  );
}
