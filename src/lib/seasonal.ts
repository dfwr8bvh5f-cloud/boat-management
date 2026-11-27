// Temporary Christmas touch for the main app header (a Santa hat on the logo
// and a light snowfall over the top bar). Shown automatically from
// 1 December 2026 through 6 January 2027 inclusive (Athens calendar date, the
// same "today" the rest of the app uses) - on 7 January the header is back to
// normal on its own. Main app header only: never in reports, invoices, PDFs or
// emails.
//
// One switch to turn the whole thing off, regardless of date:
export const SEASONAL_THEME_ENABLED = true;

const SEASON_START = "2026-12-01";
const SEASON_END = "2027-01-06";

// todayISO is a YYYY-MM-DD string (todayLocalISO()), so plain string
// comparison orders it correctly.
export function isChristmasSeason(todayISO: string): boolean {
  if (!SEASONAL_THEME_ENABLED) return false;
  return todayISO >= SEASON_START && todayISO <= SEASON_END;
}
