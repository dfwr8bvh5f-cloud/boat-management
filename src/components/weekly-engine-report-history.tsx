import { formatDateDisplay } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { WeeklyEngineReport } from "@/lib/types/database";

export function WeeklyEngineReportHistory({ reports, locale }: { reports: WeeklyEngineReport[]; locale: Locale }) {
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
      {reports.map((r) => (
        <div key={r.id} className="rounded-xl border border-fleet-border bg-white p-3">
          <div dir="ltr" className="mb-2 text-sm font-bold text-fleet-navy">
            {formatDateDisplay(r.week_of)}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[11px] text-fleet-ink">{t("weekly_main_engine_hours")}</dt>
              <dd className="font-medium text-fleet-navy">{r.main_engine_hours ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-fleet-ink">{t("weekly_generator_main_hours")}</dt>
              <dd className="font-medium text-fleet-navy">{r.generator_main_hours ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-fleet-ink">{t("weekly_generator_secondary_hours")}</dt>
              <dd className="font-medium text-fleet-navy">{r.generator_secondary_hours ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-fleet-ink">{t("weekly_watermaker_hours")}</dt>
              <dd className="font-medium text-fleet-navy">{r.watermaker_hours ?? "—"}</dd>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-[11px] text-fleet-ink">{t("weekly_fuel_status")}</dt>
              <dd className="font-medium text-fleet-navy">{r.fuel_status ?? "—"}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
