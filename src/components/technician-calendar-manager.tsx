"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { usePagedList } from "@/lib/hooks/use-paged-list";
import { createTechnicianVisit, updateTechnicianVisit, deleteTechnicianVisit } from "@/lib/actions/technician-visits";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateRangeCalendar } from "@/components/date-range-calendar";
import { RippleLoader } from "@/components/ripple-loader";
import { TechnicianCalendar, type TechnicianVisitForCalendar } from "@/components/technician-calendar";
import { TechnicianSelect } from "@/components/technician-select";
import { formatDateDisplay } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Technician } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SEARCH_INPUT_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

const inputClass = INPUT_CLASS;

type VisitWithBoats = TechnicianVisitForCalendar & { id: string };

export function TechnicianCalendarManager({
  visits,
  boats,
  technicians,
  locale,
}: {
  visits: VisitWithBoats[];
  boats: { id: string; name: string }[];
  technicians: Technician[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VisitWithBoats | null>(null);
  const [selectedBoatIds, setSelectedBoatIds] = useState<Set<string>>(new Set());
  const [boatError, setBoatError] = useState(false);
  const [kind, setKind] = useState<"visit" | "shipyard">("visit");
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggleBoat = (id: string) => {
    setBoatError(false);
    setSelectedBoatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startNew = (iso?: string) => {
    setEditing(null);
    setKind("visit");
    setSelectedBoatIds(new Set());
    setBoatError(false);
    setSaveError(null);
    setPrefillDate(iso ?? null);
    setShowForm(true);
  };
  const startEdit = (visit: VisitWithBoats) => {
    setEditing(visit);
    setKind(visit.kind === "shipyard" ? "shipyard" : "visit");
    setSelectedBoatIds(new Set(visit.boatIds));
    setBoatError(false);
    setSaveError(null);
    setPrefillDate(null);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  // Memoized - usePagedList compares this array's identity across renders
  // (see its own comment) to know when to reset back to page one, so a
  // fresh [...visits].sort() reference on every render (e.g. while typing
  // in the date picker below) made it reset every single render, which is
  // itself a state update during render - confirmed live as a "Too many
  // re-renders" crash the moment any field in the form changed.
  const [search, setSearch] = useState("");
  const deferredSearchTerm = useDeferredValue(search.trim().toLowerCase());
  const filteredVisits = useMemo(
    () =>
      visits.filter((v) => {
        if (!deferredSearchTerm) return true;
        return [v.technician_name, v.location, ...v.boatNames].filter(Boolean).some((field) => field!.toLowerCase().includes(deferredSearchTerm));
      }),
    [visits, deferredSearchTerm]
  );
  const sorted = useMemo(() => [...filteredVisits].sort((a, b) => a.start_date.localeCompare(b.start_date)), [filteredVisits]);
  const { visibleItems: visibleVisits, hasMore, loadMore } = usePagedList(sorted);

  const visitRow = (visit: VisitWithBoats) => (
    <div key={visit.id} className="flex flex-nowrap items-center gap-1.5 rounded-xl border border-fleet-border bg-white p-3 sm:gap-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          {visit.kind === "shipyard" && (
            <span className="me-1.5 rounded-full bg-fleet-highlight px-2 py-0.5 text-3xs font-bold text-fleet-navy">
              {t("tech_shipyard_word")}
            </span>
          )}
          {visit.technician_name}
        </div>
        <div className="truncate text-xs text-fleet-ink" dir="ltr">
          {formatDateDisplay(visit.start_date)}
          {visit.end_date !== visit.start_date && <> – {formatDateDisplay(visit.end_date)}</>}
          {visit.start_time && <> · {visit.start_time.slice(0, 5)}</>}
        </div>
        {(visit.boatNames.length > 0 || visit.location) && (
          <div className="truncate text-xs text-fleet-ink">
            {[visit.boatNames.join(", ") || null, visit.location].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      <button
        onClick={() => startEdit(visit)}
        aria-label="edit"
        className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
      >
        <Pencil size={16} />
      </button>
      <form action={deleteTechnicianVisit.bind(null, visit.id)}>
        <ConfirmSubmitButton
          locale={locale}
          confirmMessage={t("tech_visit_delete_confirm")}
          ariaLabel={t("delete_word")}
          className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
        >
          <Trash2 size={16} />
        </ConfirmSubmitButton>
      </form>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("tech_calendar")}</h1>
        <button
          onClick={() => (showForm ? closeForm() : startNew())}
          className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper transition-transform hover:opacity-90 active:scale-[0.97]"
        >
          {showForm ? (
            <span className="inline-flex items-center gap-1">
              <X size={14} /> {t("close_word")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Plus size={14} /> {t("tech_visit_add_cta")}
            </span>
          )}
        </button>
      </div>

      {showForm && (
        <form
          key={editing?.id ?? "new"}
          action={async (formData) => {
            if (selectedBoatIds.size === 0) {
              setBoatError(true);
              return;
            }
            setBoatError(false);
            setSaveError(null);
            setSaving(true);
            selectedBoatIds.forEach((id) => formData.append("boat_ids", id));
            try {
              if (editing) await updateTechnicianVisit(editing.id, formData);
              else await createTechnicianVisit(formData);
              setSaving(false);
              setSaved(true);
              setTimeout(() => {
                setSaved(false);
                closeForm();
              }, 1400);
            } catch (e) {
              setSaveError(e instanceof Error ? e.message : t("save_failed"));
              setSaving(false);
            }
          }}
          className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
        >
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="original_kind" value={editing?.kind ?? "visit"} />
          <div className="flex w-fit gap-1 rounded-xl bg-fleet-tabs p-1">
            {(["visit", "shipyard"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  kind === k ? "bg-fleet-navy text-fleet-paper" : "text-fleet-ink hover:bg-white/60"
                }`}
              >
                {t(k === "visit" ? "tech_kind_visit" : "tech_kind_shipyard")}
              </button>
            ))}
          </div>
          <div className="flex max-w-xs flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("technician_name")}{kind === "visit" ? " *" : ""}</label>
            <TechnicianSelect
              name="technician_name"
              defaultValue={editing?.technician_name ?? ""}
              technicians={technicians}
              locale={locale}
              isManagement
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("tech_visit_date_range_label")} *</label>
            <DateRangeCalendar
              startName="start_date"
              endName="end_date"
              defaultStart={editing?.start_date ?? prefillDate ?? undefined}
              defaultEnd={editing?.end_date ?? prefillDate ?? undefined}
              locale={locale}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("tech_visit_time_label")}</label>
              <input type="time" name="start_time" defaultValue={editing?.start_time?.slice(0, 5) ?? ""} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">
                {t(kind === "shipyard" ? "tech_shipyard_location_label" : "tech_visit_location_label")}
              </label>
              <input name="location" defaultValue={editing?.location ?? ""} className={inputClass} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("tech_visit_boats_label")} *</label>
            <div className="flex flex-wrap gap-1.5">
              {boats.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBoat(b.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                    selectedBoatIds.has(b.id) ? "border-fleet-teal bg-fleet-teal text-white" : "border-fleet-border"
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
            {boatError && <p className="text-xs text-fleet-coral-text">{t("tech_visit_select_boat_error")}</p>}
          </div>
          {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button
              type="submit"
              disabled={saving || saved}
              className={`flex flex-1 items-center justify-center gap-2 ${PRIMARY_BUTTON_CLASS}`}
            >
              {saving ? (
                <>
                  <RippleLoader size="sm" /> {t("saving_word")}
                </>
              ) : saved ? (
                <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
              ) : editing ? (
                t("save_edit")
              ) : (
                t("tech_visit_add_cta")
              )}
            </button>
          </div>
        </form>
      )}

      <TechnicianCalendar
        visits={visits}
        onDayClick={(iso) => {
          if (!showForm) startNew(iso);
        }}
        locale={locale}
      />

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fleet-ink" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_placeholder")}
          className={SEARCH_INPUT_CLASS}
        />
      </div>

      {filteredVisits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("no_tech_visits")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleVisits.map(visitRow)}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              className="rounded-lg border border-fleet-border bg-white py-2.5 text-sm font-bold text-fleet-teal hover:bg-fleet-paper"
            >
              {t("load_more_word")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
