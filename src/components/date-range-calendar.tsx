"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import { todayLocalISO, localDateToISO } from "@/lib/date-format";
import type { Locale } from "@/lib/i18n/dictionaries";

const INTL_LOCALE: Record<Locale, string> = { he: "he-IL", en: "en-US", el: "el-GR" };

function isoToDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// A compact trigger button (like DateInput) that opens a small popover
// calendar for picking a trip's start and end date together: click the
// start day, then hovering later days shows a shaded preview of the range
// ("a shadow pulled to the end date"), and clicking again confirms the end
// and closes the popover.
export function DateRangeCalendar({
  startName,
  endName,
  defaultStart,
  defaultEnd,
  locale,
  onChange,
  min,
  max,
  required = true,
}: {
  startName: string;
  endName: string;
  defaultStart?: string;
  defaultEnd?: string;
  locale: Locale;
  onChange?: (start: string | null, end: string | null) => void;
  min?: string;
  max?: string;
  required?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const intlLocale = INTL_LOCALE[locale];

  const [start, setStart] = useState<string | null>(defaultStart ?? null);
  const [end, setEnd] = useState<string | null>(defaultEnd && defaultEnd !== defaultStart ? defaultEnd : null);
  const [hover, setHover] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [calMonth, setCalMonth] = useState(() => {
    const base = isoToDate(defaultStart ?? todayLocalISO());
    base.setDate(1);
    return base;
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, i + 7).toLocaleDateString(intlLocale, { weekday: "narrow" })
  );

  const changeMonth = (delta: number) => setCalMonth(new Date(year, month + delta, 1));

  const previewEnd = end ?? hover;
  const lo = start && previewEnd && start > previewEnd ? previewEnd : start;
  const hi = start && previewEnd && start > previewEnd ? start : previewEnd;

  const handleClick = (iso: string) => {
    setShowError(false);
    if (!start || end) {
      setStart(iso);
      setEnd(null);
      onChange?.(iso, null);
    } else if (iso < start) {
      setEnd(start);
      setStart(iso);
      setOpen(false);
      onChange?.(iso, start);
    } else {
      setEnd(iso);
      setOpen(false);
      onChange?.(start, iso);
    }
  };

  const cells: ({ dayNum: number; iso: string } | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstWeekday + 1;
    cells.push(dayNum < 1 || dayNum > daysInMonth ? null : { dayNum, iso: localDateToISO(year, month, dayNum) });
  }

  const endValue = end ?? start ?? "";

  const fmt = (iso: string) => isoToDate(iso).toLocaleDateString(intlLocale, { year: "numeric", month: "short", day: "numeric" });
  const displayText = start ? `${fmt(start)} – ${end ? fmt(end) : fmt(start)}` : "";

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <input type="hidden" name={startName} value={start ?? ""} />
      <input type="hidden" name={endName} value={endValue} />
      {required && (
        <input
          type="text"
          required
          value={start ?? ""}
          onChange={() => {}}
          onInvalid={(e) => {
            e.preventDefault();
            setShowError(true);
          }}
          className="sr-only"
          tabIndex={-1}
        />
      )}

      <button
        type="button"
        onClick={() => {
          setCalMonth(() => {
            const base = isoToDate(start ?? todayLocalISO());
            base.setDate(1);
            return base;
          });
          setOpen((o) => !o);
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal ${
          showError && !start ? "border-fleet-coral ring-2 ring-fleet-coral/20" : "border-fleet-border"
        }`}
      >
        <span className={displayText ? "" : "text-fleet-ink/50"}>{displayText || t("select_date_range")}</span>
        <CalendarIcon size={14} className="shrink-0 text-fleet-ink" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-72 rounded-xl border border-fleet-border bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
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
          <div className="mb-1 grid grid-cols-7 gap-1">
            {weekdayLabels.map((w, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-fleet-ink">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1" onMouseLeave={() => setHover(null)}>
            {cells.map((c, i) => {
              if (!c) return <div key={i} />;
              const outOfRange = Boolean((min && c.iso < min) || (max && c.iso > max));
              const inRange = Boolean(lo && hi && c.iso >= lo && c.iso <= hi);
              const isEdge = c.iso === start || c.iso === end;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={outOfRange}
                  onClick={() => handleClick(c.iso)}
                  onMouseEnter={() => setHover(c.iso)}
                  className={`aspect-square rounded-md text-xs transition-colors ${
                    outOfRange
                      ? "cursor-not-allowed text-fleet-ink/25 hover:bg-transparent"
                      : isEdge
                        ? "bg-fleet-teal font-bold text-white"
                        : inRange
                          ? "bg-fleet-teal/20 text-fleet-navy"
                          : "text-fleet-navy hover:bg-fleet-paper"
                  }`}
                >
                  {c.dayNum}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-fleet-ink">
            <span>
              {t("booking_from")}: <strong className="text-fleet-navy">{start ?? "—"}</strong>
            </span>
            <span>
              {t("booking_to")}: <strong className="text-fleet-navy">{endValue || "—"}</strong>
            </span>
          </div>
        </div>
      )}
      {showError && !start && <p className="text-xs text-fleet-coral">{t("booking_pick_dates_error")}</p>}
    </div>
  );
}
