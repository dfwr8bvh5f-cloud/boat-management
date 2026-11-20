// Engines and generators are serviced every 250 operating hours. The weekly
// report warns when the next service is within 20 hours.
//
// There is no recorded "last service" hour meter reading, so the next service
// is taken as the next multiple of 250 on the hour meter (250, 500, 750...).
export const SERVICE_INTERVAL_HOURS = 250;
export const SERVICE_WARNING_HOURS = 20;

// Engines (tender engines included) and generators. Gearboxes are already
// excluded from the weekly form.
export function isServiceTrackedMachine(name: string): boolean {
  const n = name.trim().toLowerCase();
  return /engine|generator|genset|gen-set|מנוע|גנרטור|גנרטורים/.test(n);
}

// Machines reported in the weekly report: every engine, every generator and
// the tender's outboard engine. Gearboxes, watermakers, the tender lift etc.
// are not reported weekly (they still live in Technical Specs).
export function isWeeklyReportMachine(name: string): boolean {
  return isServiceTrackedMachine(name) || /outboard|אאוטבורד/i.test(name);
}

// Hours left until the next 250h service for any valid reading (0 = due now),
// or null for a missing/invalid one.
export function hoursUntilService(hours: number | null | undefined): number | null {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  const intoCycle = Math.round((hours % SERVICE_INTERVAL_HOURS) * 100) / 100;
  return intoCycle === 0 ? 0 : Math.round((SERVICE_INTERVAL_HOURS - intoCycle) * 100) / 100;
}

export type ServiceStatus = { hoursRemaining: number };

// Returns how many hours are left until the next 250h service when that is
// 20 hours or fewer (0 = due now), otherwise null. Invalid readings give null.
export function serviceStatus(hours: number | null | undefined): ServiceStatus | null {
  const hoursRemaining = hoursUntilService(hours);
  return hoursRemaining != null && hoursRemaining <= SERVICE_WARNING_HOURS ? { hoursRemaining } : null;
}
