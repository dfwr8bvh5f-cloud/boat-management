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
  allowClear,
  placeholder,
  min,
  max,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (iso: string) => void;
  locale: Locale;
  className?: string;
  allowClear?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const intlLocale = INTL_LOCALE[locale];
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const selected = isControlled ? value : internalValue;

  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"days" | "years">("days");
  const [viewDate, setViewDate] = useState(() => (selected ? isoToDate(selected) : new Date()));
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedYearRef = useRef<HTMLButtonElement>(null);

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
    cells.push(dayNum < 1 || dayNum > daysInMonth ? null : { dayNum, iso: localDateToISO(year, month, dayNum) });
  }

  const thisRealYear = new Date().getFullYear();
  const years = Array.from({ length: 106 }, (_, i) => thisRealYear + 5 - i);

  useEffect(() => {
    if (viewMode === "years") selectedYearRef.current?.scrollIntoView({ block: "center" });
  }, [viewMode]);

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
          setViewMode("days");
          setOpen((o) => !o);
        }}
        className={`flex w-full items-center justify-between gap-2 text-start ${
          className ??
          "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal"
        }`}
      >
        <span className={displayText ? "" : "text-fleet-ink/50"}>{displayText || placeholder || t("select_date")}</span>
        <CalendarIcon size={14} className="shrink-0 text-fleet-ink" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-xl border border-fleet-border bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            {viewMode === "days" ? (
              <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label={t("prev_month")} className="text-fleet-navy">
                <ChevronLeft size={16} />
              </button>
            ) : (
              <span className="w-4" />
            )}
            <button
              type="button"
              onClick={() => setViewMode((m) => (m === "days" ? "years" : "days"))}
              className="rounded px-1.5 text-sm font-bold capitalize hover:bg-fleet-paper hover:text-fleet-teal"
            >
              {viewMode === "days" ? viewDate.toLocaleDateString(intlLocale, { month: "long", year: "numeric" }) : year}
            </button>
            {viewMode === "days" ? (
              <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label={t("next_month")} className="text-fleet-navy">
                <ChevronRight size={16} />
              </button>
            ) : (
              <span className="w-4" />
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
                    setViewMode("days");
                  }}
                  className={`rounded-md py-1.5 text-xs ${
                    y === year ? "bg-fleet-teal font-bold text-white" : "text-fleet-navy hover:bg-fleet-paper"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="mb-1 grid grid-cols-7 gap-1">
                {weekdayLabels.map((w, i) => (
                  <div key={i} className="text-center text-[10px] font-bold text-fleet-ink">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((c, i) => {
                  if (!c) return <div key={i} />;
                  const outOfRange = Boolean((min && c.iso < min) || (max && c.iso > max));
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={outOfRange}
                      onClick={() => setDate(c.iso)}
                      className={`aspect-square rounded-md text-xs hover:bg-fleet-paper ${
                        outOfRange
                          ? "cursor-not-allowed text-fleet-ink/25 hover:bg-transparent"
                          : c.iso === selected
                            ? "bg-fleet-teal font-bold text-white hover:bg-fleet-teal"
                            : c.iso === todayLocalISO()
                              ? "font-bold ring-1 ring-fleet-navy"
                              : ""
                      }`}
                    >
                      {c.dayNum}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  disabled={(min && todayLocalISO() < min) || (max && todayLocalISO() > max) ? true : false}
                  onClick={() => setDate(todayLocalISO())}
                  className="flex-1 rounded-lg bg-fleet-paper py-1.5 text-xs font-bold text-fleet-navy hover:opacity-80 disabled:opacity-40"
                >
                  {t("today_word")}
                </button>
                {allowClear && (
                  <button
                    type="button"
                    onClick={() => setDate("")}
                    className="flex-1 rounded-lg border border-fleet-border py-1.5 text-xs font-bold text-fleet-ink hover:bg-fleet-paper"
                  >
                    {t("not_set_yet")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
