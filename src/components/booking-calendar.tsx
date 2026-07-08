"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CALENDAR_FREE_COLOR, USAGE_TYPE_COLORS, getUsageTypeLabels, USAGE_TYPES } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import { todayLocalISO, localDateToISO, formatDateDisplay } from "@/lib/date-format";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Booking, BoatEvent } from "@/lib/types/database";

const INTL_LOCALE: Record<Locale, string> = { he: "he-IL", en: "en-US", el: "el-GR" };

type CrewBirthday = { name: string; date_of_birth: string | null };

// Events have no dedicated "type" field in the schema - a birthday for
// anyone relevant to the boat (owner, guest, agent, not just crew) is added
// through the same free-text "add event" form as any other special day, and
// recognized here by title so it gets the birthday toast icon instead of the
// generic event dot. Matches all three UI languages regardless of which
// locale it was typed in.
const BIRTHDAY_WORD = /יום\s*הולדת|birthday|γενέθλια/i;
export function isBirthdayEventTitle(title: string): boolean {
  return BIRTHDAY_WORD.test(title);
}

export function BookingCalendar({
  bookings,
  events = [],
  crew = [],
  onDayClick,
  usageTypes = USAGE_TYPES,
  locale,
}: {
  bookings: Booking[];
  events?: BoatEvent[];
  crew?: CrewBirthday[];
  onDayClick: (iso: string) => void;
  usageTypes?: typeof USAGE_TYPES;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const usageTypeLabels = getUsageTypeLabels(locale);
  const intlLocale = INTL_LOCALE[locale];
  const [dayInfo, setDayInfo] = useState<{ iso: string; text: string } | null>(null);

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

  const colorOf = (b: Booking) => USAGE_TYPE_COLORS[b.usage_type] ?? USAGE_TYPE_COLORS.charter;
  // Bookings run noon-to-noon, not midnight-to-midnight - a day strictly
  // between start and end is fully occupied, but the start/end day itself
  // is only occupied from/until noon, so it's shown as a diagonal split
  // between the outgoing and incoming occupant (or free, if there's no
  // adjoining booking on that side).
  const spanBookingForDate = (iso: string) => bookings.find((b) => b.start_date < iso && iso < b.end_date);
  const startBookingForDate = (iso: string) => bookings.find((b) => b.start_date === iso);
  const endBookingForDate = (iso: string) => bookings.find((b) => b.end_date === iso);
  // Birthday-titled events get pulled out of the general event list and
  // merged into the birthday indicator below, instead of showing as a
  // generic special-event dot.
  const eventsForDate = (iso: string) => events.filter((e) => e.event_date === iso && !isBirthdayEventTitle(e.title));
  const birthdayEventsForDate = (iso: string) => events.filter((e) => e.event_date === iso && isBirthdayEventTitle(e.title));
  // Compares month-day only, so a birthday matches every year, not just the
  // year it was recorded in.
  const crewBirthdaysForDate = (iso: string) => crew.filter((m) => m.date_of_birth && m.date_of_birth.slice(5) === iso.slice(5));

  const cells: (
    | {
        dayNum: number;
        iso: string;
        isToday: boolean;
        booking: Booking | undefined;
        split: { amBooking: Booking | undefined; pmBooking: Booking | undefined } | null;
        color: string;
        dayEvents: BoatEvent[];
        dayBirthdayNames: string[];
      }
    | null
  )[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null);
      continue;
    }
    const iso = localDateToISO(year, month, dayNum);
    const spanBooking = spanBookingForDate(iso);
    const startBooking = startBookingForDate(iso);
    const endBooking = endBookingForDate(iso);
    // A booking whose start and end land on the same day (both boundaries
    // resolve to the same record) is a single full day, not a turnover -
    // shown as one uniform color like a span day, not split.
    const sameDayBooking = startBooking && endBooking && startBooking.id === endBooking.id ? startBooking : undefined;
    const fullBooking = spanBooking ?? sameDayBooking;
    const split = !fullBooking && (startBooking || endBooking) ? { amBooking: endBooking, pmBooking: startBooking } : null;
    cells.push({
      dayNum,
      iso,
      isToday: iso === today,
      booking: fullBooking,
      split,
      color: fullBooking ? colorOf(fullBooking) : CALENDAR_FREE_COLOR,
      dayEvents: eventsForDate(iso),
      dayBirthdayNames: [
        ...crewBirthdaysForDate(iso).map((m) => m.name),
        ...birthdayEventsForDate(iso).map((e) => e.title),
      ],
    });
  }

  const changeMonth = (delta: number) => {
    setCalMonth(new Date(year, month + delta, 1));
    setDayInfo(null);
  };

  return (
    <div className="rounded-xl border border-fleet-border bg-white p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <button type="button" onClick={() => changeMonth(-1)} aria-label={t("prev_month")} className="text-fleet-navy">
          <ChevronLeft size={18} />
        </button>
        <div className="text-sm font-bold capitalize">
          {calMonth.toLocaleDateString(intlLocale, { month: "long", year: "numeric" })}
        </div>
        <button type="button" onClick={() => changeMonth(1)} aria-label={t("next_month")} className="text-fleet-navy">
          <ChevronRight size={18} />
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
          const hasBirthday = c.dayBirthdayNames.length > 0;
          const eventTitles = c.dayEvents.map((e) => e.title).join(", ");
          const birthdayTitle = hasBirthday ? `🎂 ${c.dayBirthdayNames.join(", ")}` : null;
          const specialText = [eventTitles || null, birthdayTitle].filter(Boolean).join(" · ");
          const bookingLabel = (b: Booking) => `${b.customer_name} · ${usageTypeLabels[b.usage_type]}`;
          const occupancyText = c.split
            ? [
                c.split.amBooking ? `${t("cal_until_noon")}: ${bookingLabel(c.split.amBooking)}` : null,
                c.split.pmBooking ? `${t("cal_from_noon")}: ${bookingLabel(c.split.pmBooking)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : c.booking
              ? bookingLabel(c.booking)
              : null;
          const title = [occupancyText, specialText || null].filter(Boolean).join(" · ");
          const amColor = c.split?.amBooking ? colorOf(c.split.amBooking) : CALENDAR_FREE_COLOR;
          const pmColor = c.split?.pmBooking ? colorOf(c.split.pmBooking) : CALENDAR_FREE_COLOR;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                setDayInfo(specialText ? { iso: c.iso, text: specialText } : null);
                onDayClick(c.iso);
              }}
              title={title || undefined}
              className={`relative flex h-8 items-center justify-center overflow-hidden rounded-md border text-[11px] sm:h-10 ${c.isToday ? "font-extrabold ring-1 ring-fleet-navy" : "font-medium"}`}
              style={{
                background: c.split ? undefined : `${c.color}33`,
                borderColor: `${c.split ? pmColor : c.color}80`,
                color: "var(--color-fleet-navy)",
              }}
            >
              {c.split && (
                <>
                  {/* Corner-to-corner diagonal split, not a fixed-angle gradient - a
                      linear-gradient angle doesn't line up with the real corners
                      unless the cell happens to be a perfect square. */}
                  <span
                    className="absolute inset-0"
                    style={{ background: `${amColor}33`, clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
                  />
                  <span
                    className="absolute inset-0"
                    style={{ background: `${pmColor}33`, clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
                  />
                </>
              )}
              <span className="relative z-10">{c.dayNum}</span>
              {hasBirthday && <span className="absolute top-0 start-1/2 z-10 -translate-x-1/2 text-[8px] rtl:translate-x-1/2">🎂</span>}
              {c.dayEvents.length > 0 && (
                <span className="absolute bottom-0 start-1/2 z-10 -translate-x-1/2 text-[8px] rtl:translate-x-1/2">🥂</span>
              )}
            </button>
          );
        })}
      </div>

      {dayInfo && (
        <div className="mt-2.5 flex items-start justify-between gap-2 rounded-lg border border-fleet-brass/40 bg-fleet-paper px-3 py-2 text-xs text-fleet-navy">
          <span>
            <span dir="ltr" className="font-bold">{formatDateDisplay(dayInfo.iso)}</span> · {dayInfo.text}
          </span>
          <button type="button" onClick={() => setDayInfo(null)} aria-label={t("close_word")} className="shrink-0 text-fleet-ink">
            ✕
          </button>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-3 text-[11px] text-fleet-ink">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CALENDAR_FREE_COLOR }} /> {t("cal_free")}
        </span>
        {usageTypes.map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: USAGE_TYPE_COLORS[k] }} /> {usageTypeLabels[k]}
          </span>
        ))}
        {(crew.some((m) => m.date_of_birth) || events.some((e) => isBirthdayEventTitle(e.title))) && (
          <span className="flex items-center gap-1">
            <span className="text-[11px]">🎂</span> {t("cal_staff_birthday")}
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="text-[11px]">🥂</span> {t("cal_special_event")}
        </span>
      </div>
    </div>
  );
}
