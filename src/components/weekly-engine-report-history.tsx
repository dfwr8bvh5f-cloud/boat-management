"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteWeeklyEngineReport } from "@/lib/actions/weekly-reports";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { WeeklyEngineReportForm } from "@/components/weekly-engine-report-form";
import { formatDateDisplay } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { WeeklyEngineReport } from "@/lib/types/database";
import type { MachineSpec } from "@/components/weekly-engine-report-form";

export function WeeklyEngineReportHistory({
  boatId,
  reports,
  entriesByReportId,
  machineSpecs,
  canEdit,
  locale,
}: {
  boatId: string;
  reports: WeeklyEngineReport[];
  entriesByReportId: Map<string, Record<string, number>>;
  machineSpecs: MachineSpec[];
  canEdit: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [editingId, setEditingId] = useState<string | null>(null);

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
            <div className="mb-2 flex items-center justify-between">
              <div dir="ltr" className="text-sm font-bold text-fleet-navy">
                {formatDateDisplay(r.week_of)}
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(editingId === r.id ? null : r.id)}
                    aria-label="edit"
                    className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                  >
                    <Pencil size={14} />
                  </button>
                  <form action={deleteWeeklyEngineReport.bind(null, boatId, r.id)}>
                    <ConfirmSubmitButton
                      locale={locale}
                      confirmMessage={t("delete_report_confirm")}
                      ariaLabel={t("delete_word")}
                      className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral"
                    >
                      <Trash2 size={14} />
                    </ConfirmSubmitButton>
                  </form>
                </div>
              )}
            </div>
            {editingId === r.id ? (
              <WeeklyEngineReportForm
                boatId={boatId}
                weekOf={r.week_of}
                existing={r}
                entriesBySpecId={entries}
                machineSpecs={machineSpecs}
                canEdit
                locale={locale}
                hideHeader
              />
            ) : (
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
                {r.notes && (
                  <div className="col-span-2 sm:col-span-4">
                    <dt className="text-[11px] text-fleet-ink">{t("notes_field")}</dt>
                    <dd className="font-medium text-fleet-navy">{r.notes}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
}
