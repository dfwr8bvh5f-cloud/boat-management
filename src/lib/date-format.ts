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

// Formats a specific (year, month 0-11, day) as YYYY-MM-DD directly from
// the given components - unlike `new Date(y, m, d).toISOString()`, this
// never round-trips through UTC, so it can't shift the date by a day for
// timezones ahead of UTC (e.g. a calendar cell for the 1st rendering as
// the last day of the previous month once midnight local time gets
// converted to UTC).
export function localDateToISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
