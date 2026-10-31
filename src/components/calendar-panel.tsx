"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import { todayLocalISO, localDateToISO, formatDateDisplay, addDaysISO } from "@/lib/date-format";
import type { Locale } from "@/lib/i18n/dictionaries";

const INTL_LOCALE: Record<Locale, string> = { he: "he-IL", en: "en-US", el: "el-GR" };

function isoToDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// The inside of every date picker's popup (DateInput's single day and
// DateRangeCalendar's start/end), so both always have the same header
// (month arrows + tap the title to jump by year), the same day cells (today
// ring, chosen fill, out-of-range dimming), the same footer buttons, the
// same display format, and the same keyboard control: arrows move by day or
// week, PageUp/PageDown by month, Enter/Space picks, Escape (handled by the
// floating panel) closes.
export function CalendarPanel({
  locale,
  selected,
  range,
  onPick,
  min,
  max,
  onClear,
  showSummary,
}: {
  locale: Locale;
  // Single-date mode: the chosen day. Range mode: pass `range` instead.
  selected?: string;
  range?: { start: string | null; end: string | null };
  onPick: (iso: string) => void;
  min?: string;
  max?: string;
  // Shows a "clear selection" button when given.
  onClear?: () => void;
  // Range mode: shows the from/to dates under the grid.
  showSummary?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const intlLocale = INTL_LOCALE[locale];
  const today = todayLocalISO();
  const anchorIso = (range ? range.start : selected) || today;

  const [viewDate, setViewDate] = useState(() => {
    const d = isoToDate(anchorIso);
    d.setDate(1);
    return d;
  });
  const [viewMode, setViewMode] = useState<"days" | "years">("days");
  const [focusIso, setFocusIso] = useState(anchorIso);
  const [hover, setHover] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedYearRef = useRef<HTMLButtonElement>(null);
  // Only move DOM focus after a keyboard move (and once on open), never
  // while the pointer is just hovering cells.
  const shouldFocusRef = useRef(true);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, i + 7).toLocaleDateString(intlLocale, { weekday: "narrow" })
  );
  const years = Array.from({ length: 106 }, (_, i) => new Date().getFullYear() + 5 - i);

  const inView = (iso: string) => iso.slice(0, 7) === localDateToISO(year, month, 1).slice(0, 7);
  // The cell that takes Tab focus: the keyboard cursor if it is on screen,
  // else the first of the month.
  const tabIso = inView(focusIso) ? focusIso : localDateToISO(year, month, 1);

  useEffect(() => {
    if (viewMode === "years") selectedYearRef.current?.scrollIntoView({ block: "center" });
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "days" || !shouldFocusRef.current) return;
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${tabIso}"]`)?.focus({ preventScroll: true });
    shouldFocusRef.current = false;
  }, [viewMode, tabIso, viewDate]);

  const outOfRange = (iso: string) => Boolean((min && iso < min) || (max && iso > max));

  const moveFocus = (iso: string) => {
    shouldFocusRef.current = true;
    setFocusIso(iso);
    const d = isoToDate(iso);
    if (d.getFullYear() !== year || d.getMonth() !== month) setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    if (range) setHover(iso);
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    // Arrows follow what is drawn: in a right-to-left page the next day is on the left.
    const rtl = getComputedStyle(e.currentTarget as Element).direction === "rtl";
    const step = (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0) * (rtl ? -1 : 1);
    let next: string | null = null;
    if (step) next = addDaysISO(tabIso, step);
    else if (e.key === "ArrowDown") next = addDaysISO(tabIso, 7);
    else if (e.key === "ArrowUp") next = addDaysISO(tabIso, -7);
    else if (e.key === "PageDown" || e.key === "PageUp") {
      const d = isoToDate(tabIso);
      const target = new Date(d.getFullYear(), d.getMonth() + (e.key === "PageDown" ? 1 : -1), 1);
      const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      next = localDateToISO(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
    } else if (e.key === "Home") next = localDateToISO(year, month, 1);
    else if (e.key === "End") next = localDateToISO(year, month, daysInMonth);
    if (next) {
      e.preventDefault();
      moveFocus(next);
    }
  };

  // Range preview: the hovered/keyboard day acts as a provisional end.
  const previewEnd = range ? (range.end ?? hover) : null;
  const lo = range?.start && previewEnd && range.start > previewEnd ? previewEnd : (range?.start ?? null);
  const hi = range?.start && previewEnd && range.start > previewEnd ? range.start : previewEnd;

  const cells: ({ dayNum: number; iso: string } | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstWeekday + 1;
    cells.push(dayNum < 1 || dayNum > daysInMonth ? null : { dayNum, iso: localDateToISO(year, month, dayNum) });
  }

  const dayClass = (iso: string) => {
    const base = "aspect-square rounded-md text-xs outline-none focus-visible:ring-2 focus-visible:ring-fleet-navy";
    if (outOfRange(iso)) return `${base} cursor-not-allowed text-fleet-ink/25`;
    const isEdge = range ? iso === range.start || iso === range.end : iso === selected;
    if (isEdge) return `${base} bg-fleet-teal font-bold text-white`;
    if (range && lo && hi && iso >= lo && iso <= hi) return `${base} bg-fleet-teal/20 text-fleet-navy`;
    if (iso === today) return `${base} font-bold text-fleet-navy ring-1 ring-fleet-navy hover:bg-fleet-paper`;
    return `${base} text-fleet-navy hover:bg-fleet-paper`;
  };

  const todayDisabled = outOfRange(today);
  const fmt = (iso: string | null | undefined) => (iso ? formatDateDisplay(iso) : t("not_set_yet"));

  return (
    <div ref={rootRef} className="w-72 p-3">
      <div className="mb-2 flex items-center justify-between">
        {viewMode === "days" ? (
          <button
            type="button"
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            aria-label={t("prev_month")}
            className="rounded p-1 text-fleet-navy hover:bg-fleet-paper"
          >
            <ChevronLeft size={16} className="rtl:rotate-180" />
          </button>
        ) : (
          <span className="w-6" />
        )}
        <button
          type="button"
          onClick={() => setViewMode((m) => (m === "days" ? "years" : "days"))}
          className="rounded px-1.5 text-sm font-bold capitalize hover:bg-fleet-paper hover:text-fleet-teal"
        >
          {viewMode === "days" ? viewDate.toLocaleDateString(intlLocale, { month: "long", year: "numeric" }) : year}
        </button>
        {viewMode === "days" ? (
          <button
            type="button"
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            aria-label={t("next_month")}
            className="rounded p-1 text-fleet-navy hover:bg-fleet-paper"
          >
            <ChevronRight size={16} className="rtl:rotate-180" />
          </button>
        ) : (
          <span className="w-6" />
        )}
      </div>

      {viewMode === "years" ? (
        <div className="grid max-h-52 grid-cols-3 gap-1 overflow-y-auto">
          {years.map((y) => (
            <button
              key={y}
              ref={y === year ? selectedYearRef : undefined}
              type="button"
              onClick={() => {
                setViewDate(new Date(y, month, 1));
                shouldFocusRef.current = true;
                setViewMode("days");
              }}
              className={`rounded-md py-1.5 text-xs ${y === year ? "bg-fleet-teal font-bold text-white" : "text-fleet-navy hover:bg-fleet-paper"}`}
            >
              {y}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-1 grid grid-cols-7 gap-1">
            {weekdayLabels.map((w, i) => (
              <div key={i} className="text-center text-3xs font-bold text-fleet-ink">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1" onKeyDown={onGridKeyDown} onMouseLeave={() => setHover(null)}>
            {cells.map((c, i) =>
              c ? (
                <button
                  key={i}
                  type="button"
                  data-iso={c.iso}
                  tabIndex={c.iso === tabIso ? 0 : -1}
                  disabled={outOfRange(c.iso)}
                  onClick={() => onPick(c.iso)}
                  onFocus={() => setFocusIso(c.iso)}
                  onMouseEnter={() => range && setHover(c.iso)}
                  className={dayClass(c.iso)}
                >
                  {c.dayNum}
                </button>
              ) : (
                <div key={i} />
              )
            )}
          </div>
          {showSummary && range && (
            <div className="mt-2 flex items-center justify-between text-3xs text-fleet-ink">
              <span>
                {t("booking_from")}:{" "}
                <strong dir="ltr" className="text-fleet-navy">
                  {fmt(range.start)}
                </strong>
              </span>
              <span>
                {t("booking_to")}:{" "}
                <strong dir="ltr" className="text-fleet-navy">
                  {fmt(range.end ?? range.start)}
                </strong>
              </span>
            </div>
          )}
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              disabled={todayDisabled}
              onClick={() => onPick(today)}
              className="flex-1 rounded-lg bg-fleet-paper py-1.5 text-xs font-bold text-fleet-navy hover:opacity-80 disabled:opacity-40"
            >
              {t("today_word")}
            </button>
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className="flex-1 rounded-lg border border-fleet-border py-1.5 text-xs font-bold text-fleet-ink hover:bg-fleet-paper"
              >
                {t("clear_selection_word")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
