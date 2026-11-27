// Temporary Christmas touch for the main app header (a Santa hat on the logo
// and a light snowfall over the top bar). Shown automatically from 1 December
// to 6 January (Athens calendar, same as the rest of the app) and never
// anywhere else - not in reports, invoices, PDFs or emails.
//
// One switch to turn the whole thing off, regardless of date:
export const SEASONAL_THEME_ENABLED = true;

export function isChristmasSeason(todayISO: string): boolean {
  if (!SEASONAL_THEME_ENABLED) return false;
  const [, month, day] = todayISO.split("-").map(Number);
  return month === 12 || (month === 1 && day <= 6);
}
