"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

const INTL_LOCALE: Record<Locale, string> = { he: "he-IL", en: "en-US", el: "el-GR" };

// A fully custom month picker, used instead of native <input type="month">
// on the invoices page - same reason as DateInput (see its comment): the
// native picker always renders its month/year text in the browser/OS
// language, ignoring the app's own language switcher.
export function MonthInput({
  name,
  defaultValue,
  locale,
}: {
  name: string;
  defaultValue: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const intlLocale = INTL_LOCALE[locale];
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => Number(defaultValue.slice(0, 4)));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const [selectedYear, selectedMonth] = value.split("-").map(Number);

  const months = Array.from({ length: 12 }, (_, i) => ({
    num: i + 1,
    label: new Date(2024, i, 1).toLocaleDateString(intlLocale, { month: "short" }),
  }));

  const displayText = new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString(intlLocale, {
    month: "long",
    year: "numeric",
  });

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => {
          setViewYear(selectedYear);
          setOpen((o) => !o);
        }}
        className="flex items-center gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm capitalize text-fleet-navy outline-none focus:border-fleet-teal"
      >
        {displayText}
        <CalendarIcon size={14} className="shrink-0 text-fleet-ink" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-xl border border-fleet-border bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setViewYear((y) => y - 1)} aria-label={t("prev_month")} className="text-fleet-navy">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold">{viewYear}</span>
            <button type="button" onClick={() => setViewYear((y) => y + 1)} aria-label={t("next_month")} className="text-fleet-navy">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {months.map((m) => (
              <button
                key={m.num}
                type="button"
                onClick={() => {
                  setValue(`${viewYear}-${String(m.num).padStart(2, "0")}`);
                  setOpen(false);
                }}
                className={`rounded-md py-1.5 text-xs capitalize ${
                  viewYear === selectedYear && m.num === selectedMonth
                    ? "bg-fleet-teal font-bold text-white"
                    : "text-fleet-navy hover:bg-fleet-paper"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
