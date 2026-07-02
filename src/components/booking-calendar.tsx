"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CALENDAR_FREE_COLOR, USAGE_TYPE_COLORS, getUsageTypeLabels, USAGE_TYPES } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Booking } from "@/lib/types/database";

const INTL_LOCALE: Record<Locale, string> = { he: "he-IL", en: "en-US", el: "el-GR" };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function BookingCalendar({
  bookings,
  onDayClick,
  locale,
}: {
  bookings: Booking[];
  onDayClick: (iso: string) => void;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const usageTypeLabels = getUsageTypeLabels(locale);
  const intlLocale = INTL_LOCALE[locale];

  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const today = todayISO();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, i + 7).toLocaleDateString(intlLocale, { weekday: "narrow" })
  );

  const bookingForDate = (iso: string) => bookings.find((b) => b.start_date <= iso && iso <= b.end_date);

  const cells: ({ dayNum: number; iso: string; isToday: boolean; booking: Booking | undefined } | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null);
      continue;
    }
    const iso = new Date(year, month, dayNum).toISOString().slice(0, 10);
    cells.push({ dayNum, iso, isToday: iso === today, booking: bookingForDate(iso) });
  }

  const changeMonth = (delta: number) => setCalMonth(new Date(year, month + delta, 1));

  return (
    <div className="rounded-xl border border-fleet-border bg-white p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <button type="button" onClick={() => changeMonth(-1)} aria-label="prev month" className="text-fleet-navy">
          <ChevronRight size={18} />
        </button>
        <div className="text-sm font-bold capitalize">
          {calMonth.toLocaleDateString(intlLocale, { month: "long", year: "numeric" })}
        </div>
        <button type="button" onClick={() => changeMonth(1)} aria-label="next month" className="text-fleet-navy">
          <ChevronLeft size={18} />
        </button>
      </div>

      <div className="mb-1.5 grid grid-cols-7 gap-1">
        {weekdayLabels.map((w) => (
          <div key={w} className="text-center text-[10px] font-bold text-fleet-ink">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const free = !c.booking;
          const color = free ? CALENDAR_FREE_COLOR : USAGE_TYPE_COLORS[c.booking!.usage_type] ?? USAGE_TYPE_COLORS.charter;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onDayClick(c.iso)}
              title={c.booking ? `${c.booking.customer_name} · ${usageTypeLabels[c.booking.usage_type]}` : undefined}
              className={`aspect-square rounded-md border text-[11px] ${c.isToday ? "font-extrabold ring-1 ring-fleet-navy" : "font-medium"}`}
              style={{ background: `${color}1F`, borderColor: `${color}66`, color: "var(--color-fleet-navy)" }}
            >
              {c.dayNum}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-3 text-[11px] text-fleet-ink">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CALENDAR_FREE_COLOR }} /> {t("cal_free")}
        </span>
        {USAGE_TYPES.map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: USAGE_TYPE_COLORS[k] }} /> {usageTypeLabels[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
