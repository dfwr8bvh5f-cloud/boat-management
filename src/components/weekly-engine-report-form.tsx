"use client";

import { useState } from "react";
import { Gauge } from "lucide-react";
import { upsertWeeklyEngineReport } from "@/lib/actions/weekly-reports";
import { RippleLoader } from "@/components/ripple-loader";
import { formatDateDisplay } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import { hoursUntilService, isServiceTrackedMachine, serviceStatus } from "@/lib/engine-service";
import { ConfirmPopup } from "@/components/confirm-popup";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { WeeklyEngineReport } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { INPUT_CLASS_COMPACT } from "@/lib/ui-classes";

const inputClass = INPUT_CLASS_COMPACT;

export type MachineSpec = { id: string; name: string };

export function WeeklyEngineReportForm({
  boatId,
  weekOf,
  existing,
  entriesBySpecId,
  machineSpecs,
  previousHoursBySpecId = {},
  canEdit,
  locale,
  hideHeader,
}: {
  boatId: string;
  weekOf: string;
  existing: WeeklyEngineReport | null;
  entriesBySpecId: Record<string, number>;
  machineSpecs: MachineSpec[];
  // Last week's reading per machine - a lower reading now asks for confirmation.
  previousHoursBySpecId?: Record<string, number>;
  canEdit: boolean;
  locale: Locale;
  // Skips the outer card/header - used when an ancestor (e.g. the boat
  // dashboard's collapsible summary) already shows an equivalent title/date.
  hideHeader?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Live hour readings, so the 250h service warning reacts as she types.
  const [hoursValues, setHoursValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(machineSpecs.map((m) => [m.id, entriesBySpecId[m.id] != null ? String(entriesBySpecId[m.id]) : ""]))
  );

  // Engines/generators: hours left until the next 250h service, always shown
  // under the reading; `urgent` (within 20h, or due now) is highlighted.
  const serviceInfo = (m: MachineSpec, rawHours: number | string | null | undefined): { text: string; urgent: boolean } | null => {
    if (!isServiceTrackedMachine(m.name) || rawHours === "" || rawHours == null) return null;
    const remaining = hoursUntilService(Number(rawHours));
    if (remaining == null) return null;
    if (remaining === 0) return { text: translate(locale, "weekly_service_due"), urgent: true };
    return serviceStatus(Number(rawHours))
      ? { text: translate(locale, "weekly_service_soon", { hours: remaining }), urgent: true }
      : { text: translate(locale, "weekly_service_remaining", { hours: remaining }), urgent: false };
  };

  const save = async (formData: FormData) => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await upsertWeeklyEngineReport(boatId, weekOf, machineSpecs.map((m) => m.id), formData);
      setSaved(true);
    } catch (e) {
      console.error("weekly report save failed:", e);
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  // Hour meters only go up: a reading below last week's asks before saving.
  const [pendingSave, setPendingSave] = useState<{ formData: FormData; machines: string } | null>(null);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const lower = machineSpecs.filter((m) => {
      const raw = formData.get(`hours_${m.id}`);
      const prev = previousHoursBySpecId[m.id];
      return raw != null && String(raw).trim() !== "" && prev != null && Number(raw) < prev;
    });
    if (lower.length > 0) setPendingSave({ formData, machines: lower.map((m) => m.name).join(", ") });
    else void save(formData);
  };

  const content = (
    <>
      {canEdit ? (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {machineSpecs.length === 0 && (
            <p className="col-span-2 text-xs text-fleet-ink sm:col-span-4">{t("weekly_no_machines")}</p>
          )}
          {machineSpecs.map((m) => (
            <div key={m.id} className="flex flex-col gap-1.5">
              <label htmlFor={`hours_${m.id}`} className="text-xs text-fleet-ink">{m.name}</label>
              <input
                id={`hours_${m.id}`}
                name={`hours_${m.id}`}
                type="number"
                step="any"
                value={hoursValues[m.id] ?? ""}
                onChange={(e) => setHoursValues((v) => ({ ...v, [m.id]: e.target.value }))}
                className={inputClass}
              />
              {serviceInfo(m, hoursValues[m.id]) && (
                <div
                  role={serviceInfo(m, hoursValues[m.id])!.urgent ? "alert" : undefined}
                  className={`text-2xs ${serviceInfo(m, hoursValues[m.id])!.urgent ? "font-semibold text-fleet-coral-text" : "text-fleet-ink"}`}
                >
                  {serviceInfo(m, hoursValues[m.id])!.text}
                </div>
              )}
            </div>
          ))}
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-4">
            <label htmlFor="fuel_status" className="text-xs text-fleet-ink">{t("weekly_fuel_status")}</label>
            {/* Liters only - a plain number, never a percentage or free text. */}
            <input
              id="fuel_status"
              name="fuel_status"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              defaultValue={existing?.fuel_status ?? ""}
              className={inputClass}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-4">
            <label htmlFor="weekly_notes" className="text-xs text-fleet-ink">{t("notes_field")}</label>
            <textarea id="weekly_notes" name="notes" rows={2} defaultValue={existing?.notes ?? ""} className={`${inputClass} h-auto resize-none py-1.5`} />
          </div>
          <div className="col-span-2 flex flex-col items-center gap-1.5 sm:col-span-4">
            <Button type="submit" variant="primary" className="w-full" disabled={saving || saved}>
              {saving ? (
                <>
                  <RippleLoader size="sm" /> {t("saving_word")}
                </>
              ) : saved ? (
                <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
              ) : existing ? (
                t("save_edit")
              ) : (
                t("weekly_report_submit")
              )}
            </Button>
            {saveError && <div className="text-xs text-fleet-coral-text">{saveError}</div>}
          </div>
        </form>
      ) : existing || Object.keys(entriesBySpecId).length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          {machineSpecs.map((m) => (
            <div key={m.id}>
              <dt className="text-2xs text-fleet-ink">{m.name}</dt>
              <dd className="font-medium text-fleet-navy">{entriesBySpecId[m.id] ?? "—"}</dd>
              {serviceInfo(m, entriesBySpecId[m.id]) && (
                <dd className={`text-2xs ${serviceInfo(m, entriesBySpecId[m.id])!.urgent ? "font-semibold text-fleet-coral-text" : "text-fleet-ink"}`}>
                  {serviceInfo(m, entriesBySpecId[m.id])!.text}
                </dd>
              )}
            </div>
          ))}
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-2xs text-fleet-ink">{t("weekly_fuel_status")}</dt>
            <dd className="font-medium text-fleet-navy">{existing?.fuel_status ?? "—"}</dd>
          </div>
          {existing?.notes && (
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-2xs text-fleet-ink">{t("notes_field")}</dt>
              <dd className="font-medium text-fleet-navy">{existing.notes}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-sm text-fleet-ink">{t("weekly_report_none_yet")}</p>
      )}
      {pendingSave && (
        <ConfirmPopup
          locale={locale}
          message={translate(locale, "weekly_hours_lower_confirm", { machines: pendingSave.machines })}
          onCancel={() => setPendingSave(null)}
          onConfirm={() => {
            const fd = pendingSave.formData;
            setPendingSave(null);
            void save(fd);
          }}
        />
      )}
    </>
  );

  if (hideHeader) return content;

  return (
    <div className="rounded-xl border border-fleet-border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
          <Gauge size={16} className="text-fleet-brass" /> {t("weekly_report_title")}
        </div>
        <span dir="ltr" className="text-xs text-fleet-ink">
          {formatDateDisplay(weekOf)}
        </span>
      </div>
      {content}
    </div>
  );
}
