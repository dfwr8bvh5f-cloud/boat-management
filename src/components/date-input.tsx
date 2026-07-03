"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

const INTL_LOCALE: Record<Locale, string> = { he: "he-IL", en: "en-US", el: "el-GR" };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isoToDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// A fully custom date picker, used instead of native <input type="date">
// everywhere in the app - the native picker always renders in the
// browser/OS language, ignoring our own language switcher, so it's the only
// way to keep the picker's month/weekday names in the language the user
// actually picked in the app.
export function DateInput({
  name,
  defaultValue,
  value,
  onChange,
  locale,
  className,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (iso: string) => void;
  locale: Locale;
  className?: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const intlLocale = INTL_LOCALE[locale];
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const selected = isControlled ? value : internalValue;

  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (selected ? isoToDate(selected) : new Date()));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const setDate = (iso: string) => {
    if (!isControlled) setInternalValue(iso);
    onChange?.(iso);
    setOpen(false);
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, i + 7).toLocaleDateString(intlLocale, { weekday: "narrow" })
  );

  const cells: ({ dayNum: number; iso: string } | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstWeekday + 1;
    cells.push(dayNum < 1 || dayNum > daysInMonth ? null : { dayNum, iso: toIso(year, month, dayNum) });
  }

  const displayText = selected
    ? isoToDate(selected).toLocaleDateString(intlLocale, { year: "numeric", month: "short", day: "numeric" })
    : "";

  return (
    <div ref={containerRef} className="relative">
      {name && <input type="hidden" name={name} value={selected ?? ""} />}
      <button
        type="button"
        onClick={() => {
          setViewDate(selected ? isoToDate(selected) : new Date());
          setOpen((o) => !o);
        }}
        className={
          className ??
          "flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal"
        }
      >
        <span className={displayText ? "" : "text-fleet-ink/50"}>{displayText || t("select_date")}</span>
        <CalendarIcon size={14} className="shrink-0 text-fleet-ink" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-xl border border-fleet-border bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="prev month" className="text-fleet-navy">
              <ChevronRight size={16} />
            </button>
            <div className="text-sm font-bold capitalize">
              {viewDate.toLocaleDateString(intlLocale, { month: "long", year: "numeric" })}
            </div>
            <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="next month" className="text-fleet-navy">
              <ChevronLeft size={16} />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1">
            {weekdayLabels.map((w, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-fleet-ink">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) =>
              c ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDate(c.iso)}
                  className={`aspect-square rounded-md text-xs hover:bg-fleet-paper ${
                    c.iso === selected
                      ? "bg-fleet-teal font-bold text-white hover:bg-fleet-teal"
                      : c.iso === todayISO()
                        ? "font-bold ring-1 ring-fleet-navy"
                        : ""
                  }`}
                >
                  {c.dayNum}
                </button>
              ) : (
                <div key={i} />
              )
            )}
          </div>
          <button
            type="button"
            onClick={() => setDate(todayISO())}
            className="mt-2 w-full rounded-lg bg-fleet-paper py-1.5 text-xs font-bold text-fleet-navy hover:opacity-80"
          >
            {t("today_word")}
          </button>
        </div>
      )}
    </div>
  );
}
