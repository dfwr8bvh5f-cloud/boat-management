import { formatDateDisplay } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { WeeklyEngineReport } from "@/lib/types/database";
import type { MachineSpec } from "@/components/weekly-engine-report-form";

export function WeeklyEngineReportHistory({
  reports,
  entriesByReportId,
  machineSpecs,
  locale,
}: {
  reports: WeeklyEngineReport[];
  entriesByReportId: Map<string, Record<string, number>>;
  machineSpecs: MachineSpec[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  if (reports.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
        {t("weekly_report_history_none")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {reports.map((r) => {
        const entries = entriesByReportId.get(r.id) ?? {};
        return (
          <div key={r.id} className="rounded-xl border border-fleet-border bg-white p-3">
            <div dir="ltr" className="mb-2 text-sm font-bold text-fleet-navy">
              {formatDateDisplay(r.week_of)}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              {machineSpecs.map((m) => (
                <div key={m.id}>
                  <dt className="text-[11px] text-fleet-ink">{m.name}</dt>
                  <dd className="font-medium text-fleet-navy">{entries[m.id] ?? "—"}</dd>
                </div>
              ))}
              <div className="col-span-2 sm:col-span-4">
                <dt className="text-[11px] text-fleet-ink">{t("weekly_fuel_status")}</dt>
                <dd className="font-medium text-fleet-navy">{r.fuel_status ?? "—"}</dd>
              </div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}
