"use client";

import { useState } from "react";
import { Check, Gauge } from "lucide-react";
import { upsertWeeklyEngineReport } from "@/lib/actions/weekly-reports";
import { formatDateDisplay } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { WeeklyEngineReport } from "@/lib/types/database";
import { INPUT_CLASS } from "@/lib/ui-classes";

const inputClass = INPUT_CLASS;

export type MachineSpec = { id: string; name: string };

export function WeeklyEngineReportForm({
  boatId,
  weekOf,
  existing,
  entriesBySpecId,
  machineSpecs,
  canEdit,
  locale,
  hideHeader,
}: {
  boatId: string;
  weekOf: string;
  existing: WeeklyEngineReport | null;
  entriesBySpecId: Record<string, number>;
  machineSpecs: MachineSpec[];
  canEdit: boolean;
  locale: Locale;
  // Skips the outer card/header - used when an ancestor (e.g. the boat
  // dashboard's collapsible summary) already shows an equivalent title/date.
  hideHeader?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const content = (
    <>
      {canEdit ? (
        <form
          action={async (formData) => {
            setSaving(true);
            setSaved(false);
            setSaveError(false);
            try {
              await upsertWeeklyEngineReport(boatId, weekOf, machineSpecs.map((m) => m.id), formData);
              setSaved(true);
            } catch (e) {
              console.error("weekly report save failed:", e);
              setSaveError(true);
            } finally {
              setSaving(false);
            }
          }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {machineSpecs.length === 0 && (
            <p className="col-span-2 text-xs text-fleet-ink sm:col-span-4">{t("weekly_no_machines")}</p>
          )}
          {machineSpecs.map((m) => (
            <div key={m.id} className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{m.name}</label>
              <input
                name={`hours_${m.id}`}
                type="number"
                step="any"
                defaultValue={entriesBySpecId[m.id] ?? ""}
                className={inputClass}
              />
            </div>
          ))}
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-4">
            <label className="text-xs text-fleet-ink">{t("weekly_fuel_status")}</label>
            <input name="fuel_status" defaultValue={existing?.fuel_status ?? ""} className={inputClass} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-4">
            <label className="text-xs text-fleet-ink">{t("notes_field")}</label>
            <textarea name="notes" rows={2} defaultValue={existing?.notes ?? ""} className={inputClass} />
          </div>
          <div className="col-span-2 flex flex-col items-center gap-1.5 sm:col-span-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {existing ? t("save_edit") : t("weekly_report_submit")}
            </button>
            {(saving || saved || saveError) && (
              <div className={`flex items-center gap-1 text-xs ${saveError ? "text-fleet-coral" : "text-fleet-moss"}`}>
                {saveError ? t("save_failed") : saving ? t("saving_word") : <><Check size={12} /> {t("saved_word")}</>}
              </div>
            )}
          </div>
        </form>
      ) : existing || Object.keys(entriesBySpecId).length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          {machineSpecs.map((m) => (
            <div key={m.id}>
              <dt className="text-[11px] text-fleet-ink">{m.name}</dt>
              <dd className="font-medium text-fleet-navy">{entriesBySpecId[m.id] ?? "—"}</dd>
            </div>
          ))}
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-[11px] text-fleet-ink">{t("weekly_fuel_status")}</dt>
            <dd className="font-medium text-fleet-navy">{existing?.fuel_status ?? "—"}</dd>
          </div>
          {existing?.notes && (
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-[11px] text-fleet-ink">{t("notes_field")}</dt>
              <dd className="font-medium text-fleet-navy">{existing.notes}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-sm text-fleet-ink">{t("weekly_report_none_yet")}</p>
      )}
    </>
  );

  if (hideHeader) return content;

  return (
    <div className="rounded-xl border border-fleet-border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
          <Gauge size={15} className="text-fleet-brass" /> {t("weekly_report_title")}
        </div>
        <span dir="ltr" className="text-xs text-fleet-ink">
          {formatDateDisplay(weekOf)}
        </span>
      </div>
      {content}
    </div>
  );
}
