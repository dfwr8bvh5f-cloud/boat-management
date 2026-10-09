"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { CALENDAR_EVENT_COLOR } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import { todayLocalISO, localDateToISO, formatDateDisplay } from "@/lib/date-format";
import type { Locale } from "@/lib/i18n/dictionaries";

// Free days here are a neutral fleet-ink gray, not the green (CALENDAR_FREE_COLOR)
// the boats' own booking calendars use for "available" - in the technical
// manager's calendar a free day isn't a positive signal worth coloring.
const TECH_FREE_COLOR = "#5b6472";
// Shipyard jobs: fleet-amber, so they read clearly apart from both the free
// gray and the visit teal (fleet-brass was too close to the gray for the
// half-day diagonal to show).
const SHIPYARD_COLOR = "#b9b750";

const INTL_LOCALE: Record<Locale, string> = { he: "he-IL", en: "en-US", el: "el-GR" };

export type TechnicianVisitForCalendar = {
  id: string;
  technician_name: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  location: string | null;
  kind?: "visit" | "shipyard";
  boatIds: string[];
  boatNames: string[];
};

// Same month-grid look as BookingCalendar (grid-cols-7, colored day cells,
// click-a-day detail panel, legend row) - a visit is a plain inclusive date
// range (not noon-to-noon like a booking), so no AM/PM split is needed. A
// multi-day shipyard job is the exception: like a charter it runs noon to
// noon, so its first/last day is a corner-to-corner diagonal split between
// the job and the free (or adjoining job) half, same as BookingCalendar.
export function TechnicianCalendar({
  visits,
  onDayClick,
  locale,
}: {
  visits: TechnicianVisitForCalendar[];
  onDayClick: (iso: string) => void;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const intlLocale = INTL_LOCALE[locale];
  const [dayInfo, setDayInfo] = useState<{ iso: string; visits: TechnicianVisitForCalendar[] } | null>(null);

  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const today = todayLocalISO();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, i + 7).toLocaleDateString(intlLocale, { weekday: "narrow" })
  );

  // A single-day shipyard job has no noon-to-noon span, so it falls back to a
  // plain full day like any visit.
  const isYard = (v: TechnicianVisitForCalendar) => v.kind === "shipyard" && v.start_date !== v.end_date;
  const visitsForDate = (iso: string) => visits.filter((v) => v.start_date <= iso && iso <= v.end_date);
  const yardSpanForDate = (iso: string) => visits.find((v) => isYard(v) && v.start_date < iso && iso < v.end_date);
  const yardStartForDate = (iso: string) => visits.find((v) => isYard(v) && v.start_date === iso);
  const yardEndForDate = (iso: string) => visits.find((v) => isYard(v) && v.end_date === iso);

  type Cell = {
    dayNum: number;
    iso: string;
    isToday: boolean;
    dayVisits: TechnicianVisitForCalendar[];
    // Background of the whole cell, or (split) of its morning/afternoon half.
    amColor: string;
    pmColor: string;
    split: boolean;
  };
  const cells: (Cell | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null);
      continue;
    }
    const iso = localDateToISO(year, month, dayNum);
    const dayVisits = visitsForDate(iso);
    // A plain visit or a single-day job on the day colors it fully (the
    // detail panel still lists everything); otherwise a shipyard span is
    // solid, and its start/end day is split at noon.
    const plain = dayVisits.some((v) => v.kind !== "shipyard");
    const yardFullDay = dayVisits.some((v) => v.kind === "shipyard" && !isYard(v));
    let amColor = TECH_FREE_COLOR;
    let pmColor = TECH_FREE_COLOR;
    let split = false;
    if (plain) {
      amColor = pmColor = CALENDAR_EVENT_COLOR;
    } else if (yardFullDay || yardSpanForDate(iso)) {
      amColor = pmColor = SHIPYARD_COLOR;
    } else {
      const starts = yardStartForDate(iso);
      const ends = yardEndForDate(iso);
      if (starts || ends) {
        split = true;
        amColor = ends ? SHIPYARD_COLOR : TECH_FREE_COLOR;
        pmColor = starts ? SHIPYARD_COLOR : TECH_FREE_COLOR;
      }
    }
    cells.push({ dayNum, iso, isToday: iso === today, dayVisits, amColor, pmColor, split });
  }

  const changeMonth = (delta: number) => {
    setCalMonth(new Date(year, month + delta, 1));
    setDayInfo(null);
  };

  const visitLabel = (v: TechnicianVisitForCalendar) =>
    [v.kind === "shipyard" ? t("tech_shipyard_word") : null, v.technician_name, v.boatNames.join(", ") || null, v.location].filter(Boolean).join(" · ");

  return (
    <div className="rounded-xl border border-fleet-border bg-white p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <button type="button" onClick={() => changeMonth(-1)} aria-label={t("prev_month")} className="text-fleet-navy">
          <ChevronLeft size={16} />
        </button>
        <div className="text-sm font-bold capitalize">
          {calMonth.toLocaleDateString(intlLocale, { month: "long", year: "numeric" })}
        </div>
        <button type="button" onClick={() => changeMonth(1)} aria-label={t("next_month")} className="text-fleet-navy">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mb-1.5 grid grid-cols-7 gap-1">
        {weekdayLabels.map((w, i) => (
          <div key={i} className="text-center text-3xs font-bold text-fleet-ink">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const hasVisits = c.dayVisits.length > 0;
          const color = c.amColor;
          const title = c.dayVisits.map(visitLabel).join(" · ");
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                setDayInfo(hasVisits ? { iso: c.iso, visits: c.dayVisits } : null);
                onDayClick(c.iso);
              }}
              title={title || undefined}
              className={`relative flex h-10 items-center justify-center overflow-hidden rounded-md border text-2xs ${c.isToday ? "font-extrabold ring-1 ring-fleet-navy" : "font-medium"}`}
              style={{
                background: c.split ? undefined : `${color}33`,
                borderColor: c.split ? `${TECH_FREE_COLOR}80` : `${color}80`,
                color: "var(--color-fleet-navy)",
              }}
            >
              {c.split && (
                <>
                  {/* Corner-to-corner, not a fixed-angle gradient (see BookingCalendar). */}
                  <span className="absolute inset-0" style={{ background: `${c.amColor}33`, clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
                  <span className="absolute inset-0" style={{ background: `${c.pmColor}33`, clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
                </>
              )}
              <span className="relative z-10">{c.dayNum}</span>
              {hasVisits && c.dayVisits.length > 1 && (
                <span className="absolute bottom-0.5 end-0.5 z-10 text-3xs font-bold text-fleet-navy">{c.dayVisits.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {dayInfo && (
        <div className="mt-2.5 flex flex-col gap-1.5 rounded-lg border border-fleet-brass/40 bg-fleet-paper px-3 py-2 text-xs text-fleet-navy">
          <div className="flex items-start justify-between gap-2">
            <span dir="ltr" className="font-bold">{formatDateDisplay(dayInfo.iso)}</span>
            <button type="button" onClick={() => setDayInfo(null)} aria-label={t("close_word")} className="shrink-0 text-fleet-ink">
              <X size={14} />
            </button>
          </div>
          {dayInfo.visits.map((v) => (
            <div key={v.id}>{visitLabel(v)}</div>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-3 text-2xs text-fleet-ink">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TECH_FREE_COLOR }} /> {t("cal_free")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CALENDAR_EVENT_COLOR }} /> {t("tech_visit_word")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SHIPYARD_COLOR }} /> {t("tech_shipyard_word")}
        </span>
      </div>
    </div>
  );
}
