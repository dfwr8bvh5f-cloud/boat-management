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
