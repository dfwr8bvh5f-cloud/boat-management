import type { RecurrenceFrequency } from "@/lib/types/database";

// Displays a stored ISO date (YYYY-MM-DD) in day-month-year order, the
// convention she expects to read (e.g. "04-03-1990") - the underlying
// value everywhere else (sorting, filtering, DB storage, date inputs)
// stays ISO; this is a display-only transform.
export function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

// "Today" as an ISO date (YYYY-MM-DD) in the fleet's own timezone (Greece),
// not the server's/browser's local timezone. `new Date().toISOString()` is
// UTC, which reads as "yesterday" for the first 2-3 hours after local
// midnight in Athens - use this instead anywhere "today" is shown/defaulted
// to a user, in both server and client code.
export function todayLocalISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date());
}

// A date picked more than a week before or after today is usually a typo
// (wrong month/year selected by mistake) - expense-date pickers hold it
// back for confirmation instead of silently accepting it. Shared here so
// every picker (boat expenses, MYS expenses, the approval-card correction
// field) applies the exact same boundary.
export const FAR_DATE_WARNING_DAYS = 7;
export function isDateFarFromToday(iso: string): boolean {
  const diffDays = Math.round((new Date(iso).getTime() - new Date(todayLocalISO()).getTime()) / 86_400_000);
  return Math.abs(diffDays) > FAR_DATE_WARNING_DAYS;
}

// The current hour (0-23) in the fleet's own timezone (Greece). A cron
// schedule is always evaluated in UTC and can't shift itself for DST twice
// a year - anything that needs to fire at a specific *local* clock time
// (e.g. "noon on the charter start date") has to run on a tighter, DST-proof
// cron (hourly or more often) and check this instead of trusting the cron's
// fixed UTC trigger time to still line up with local noon year-round.
export function athensLocalHour(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", hour: "numeric", hourCycle: "h23" }).format(new Date()));
}

// The Friday of the current reporting week (Athens time) - the weekly
// engine/fuel report is due every Friday, so "this week's report" always
// means the most recent Friday on or before today, never a future one.
export function currentReportWeekFriday(): string {
  const todayIso = todayLocalISO();
  const [y, m, d] = todayIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceFriday = (day + 2) % 7; // Fri(5)->0, Sat(6)->1, Sun(0)->2, ... Thu(4)->6
  date.setUTCDate(date.getUTCDate() - daysSinceFriday);
  return localDateToISO(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// Formats a specific (year, month 0-11, day) as YYYY-MM-DD directly from
// the given components - unlike `new Date(y, m, d).toISOString()`, this
// never round-trips through UTC, so it can't shift the date by a day for
// timezones ahead of UTC (e.g. a calendar cell for the 1st rendering as
// the last day of the previous month once midnight local time gets
// converted to UTC).
export function localDateToISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Advances an ISO date by `months`, landing on `targetDay` of the resulting
// month - clamped to that month's actual last day (e.g. targetDay=31 in a
// 30-day April becomes the 30th), never overflowing into the month after.
// Used to schedule a recurring expense's next occurrence from its fixed
// day-of-month, independent of which day within the current month it's
// actually confirmed on.
export function addMonthsClampedISO(iso: string, months: number, targetDay: number): string {
  const [y, m] = iso.split("-").map(Number);
  const totalMonths = (y * 12 + (m - 1)) + months;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths % 12;
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return localDateToISO(year, month, Math.min(targetDay, lastDayOfMonth));
}

// Advances an ISO date by a fixed number of days - used for weekly
// recurrence, where (unlike monthly/quarterly/yearly) there's no
// day-of-month to clamp to.
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return localDateToISO(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

const RECURRENCE_MONTHS: Record<"monthly" | "quarterly" | "yearly", number> = { monthly: 1, quarterly: 3, yearly: 12 };

// The single place both recurring-template mechanisms (boat-side
// expense_recurring_templates and MYS's own mys_expense_recurring_templates)
// compute a template's next occurrence from its current one - see
// confirmRecurringExpense (src/lib/actions/recurring-expenses.ts) and
// confirmMysRecurringExpense (src/lib/actions/mys-recurring-expenses.ts).
export function advanceRecurrence(iso: string, frequency: RecurrenceFrequency, dayOfMonth: number): string {
  if (frequency === "weekly") return addDaysISO(iso, 7);
  return addMonthsClampedISO(iso, RECURRENCE_MONTHS[frequency], dayOfMonth);
}
