import type { MysManagementFeeTemplate } from "@/lib/types/database";

export type DueManagementFee = {
  templateId: string;
  boatId: string;
  amount: number;
  description: string;
  period: string;
};

function isLastDayOfMonth(d: Date): boolean {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return next.getMonth() !== d.getMonth();
}

// A monthly template with no fixed trigger_day fires this many days before
// the end of the month (instead of on the last day itself) - gives her
// lead time before the month actually ends. Computed per-month (not a
// fixed day-of-month) so it lands correctly whether the month has 28, 30,
// or 31 days.
const MONTHLY_DEFAULT_LEAD_DAYS = 4;

function isDaysBeforeMonthEnd(d: Date, leadDays: number): boolean {
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() === lastDay - leadDays;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Whether a management-fee template is due "today", and if so, the charge
// it should produce - always describing the period one cycle ahead of the
// trigger date (a reminder firing a few days before September ends is for
// October, or for Q4/Oct-Dec on a quarterly template), matching the "bill a
// month/quarter ahead" rule she set. A monthly template with no fixed
// trigger_day fires MONTHLY_DEFAULT_LEAD_DAYS before the month ends, not on
// the last day itself - gives her lead time. Returns null when not due
// (wrong day, wrong month for a quarterly template, or this period was
// already handled).
export function computeDueManagementFee(
  template: Pick<MysManagementFeeTemplate, "id" | "boat_id" | "amount" | "frequency" | "trigger_day" | "last_handled_period" | "active">,
  today: Date
): DueManagementFee | null {
  if (!template.active) return null;

  if (template.frequency === "quarterly") {
    // trigger_day is meaningless here - a quarterly template only ever
    // fires on the last day of a calendar quarter (Mar/Jun/Sep/Dec).
    const quarterEndMonths = [2, 5, 8, 11];
    if (!quarterEndMonths.includes(today.getMonth()) || !isLastDayOfMonth(today)) return null;
    const qStartMonthAbs = today.getMonth() + 1;
    const qStartYear = qStartMonthAbs === 12 ? today.getFullYear() + 1 : today.getFullYear();
    const qStartMonth = qStartMonthAbs % 12;
    const qNum = Math.floor(qStartMonth / 3) + 1;
    const period = `${qStartYear}-Q${qNum}`;
    if (template.last_handled_period === period) return null;
    const qEndMonth = (qStartMonth + 2) % 12;
    return {
      templateId: template.id,
      boatId: template.boat_id,
      amount: template.amount,
      description: `Management fees Q${qNum} (${MONTH_SHORT[qStartMonth]}-${MONTH_SHORT[qEndMonth]})`,
      period,
    };
  }

  const triggeredToday =
    template.trigger_day == null ? isDaysBeforeMonthEnd(today, MONTHLY_DEFAULT_LEAD_DAYS) : today.getDate() === template.trigger_day;
  if (!triggeredToday) return null;
  const targetMonthAbs = today.getMonth() + 1;
  const targetYear = targetMonthAbs === 12 ? today.getFullYear() + 1 : today.getFullYear();
  const targetMonth = targetMonthAbs % 12;
  const period = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`;
  if (template.last_handled_period === period) return null;
  return {
    templateId: template.id,
    boatId: template.boat_id,
    amount: template.amount,
    description: `Management fees ${MONTH_NAMES[targetMonth]}`,
    period,
  };
}
