import type { MysManagementFeeTemplate } from "@/lib/types/database";

export type DueManagementFee = {
  templateId: string;
  boatId: string;
  amount: number;
  description: string;
  period: string;
};

// A monthly template with no fixed trigger_day fires this many days before
// the end of the month (instead of on the last day itself) - gives her
// lead time before the month actually ends.
const MONTHLY_DEFAULT_LEAD_DAYS = 4;

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

type FeeTemplateInput = Pick<
  MysManagementFeeTemplate,
  "id" | "boat_id" | "amount" | "charge_label" | "frequency" | "trigger_day" | "last_handled_period" | "active" | "created_at"
>;

// --- monthly period helpers ("YYYY-MM", 1-indexed month) ---

function monthPeriodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonthPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

// The date a monthly template becomes due to bill `period` - one calendar
// month before that period starts, on the fixed trigger_day, or (when
// unset) MONTHLY_DEFAULT_LEAD_DAYS before that earlier month's own end.
// Uses the Date constructor's own month over/underflow normalization
// (month index -1 becomes December of the previous year) instead of manual
// modulo arithmetic.
function monthlyTriggerDateFor(period: string, template: Pick<FeeTemplateInput, "trigger_day">): Date {
  const [y, m] = period.split("-").map(Number); // m: 1-indexed target month
  const beforeMonthIndex0 = m - 2; // (m - 1) is the target's own 0-indexed month; one more back is the trigger month
  const day = template.trigger_day ?? new Date(y, beforeMonthIndex0 + 1, 0).getDate() - MONTHLY_DEFAULT_LEAD_DAYS;
  return new Date(y, beforeMonthIndex0, day);
}

// --- quarterly period helpers ("YYYY-Q#") ---

function quarterPeriodOf(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${q}`;
}

function nextQuarterPeriod(period: string): string {
  const [yStr, qStr] = period.split("-Q");
  const y = Number(yStr);
  const q = Number(qStr);
  return q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`;
}

// The date a quarterly template becomes due to bill `period` - the last day
// of the month right before that quarter starts (Mar/Jun/Sep/Dec).
function quarterlyTriggerDateFor(period: string): Date {
  const [yStr, qStr] = period.split("-Q");
  const y = Number(yStr);
  const q = Number(qStr);
  const quarterStartMonthIndex0 = (q - 1) * 3;
  return new Date(y, quarterStartMonthIndex0, 0);
}

// Which period a never-yet-handled template should first offer, anchored
// to its own creation date rather than "today" - so the very first
// reminder stays fixed and keeps showing (doesn't silently jump forward or
// vanish) no matter how many months pass before she acts on it.
function firstCandidatePeriod(template: Pick<FeeTemplateInput, "last_handled_period" | "created_at" | "frequency">): string {
  if (template.frequency === "quarterly") {
    return template.last_handled_period
      ? nextQuarterPeriod(template.last_handled_period)
      : nextQuarterPeriod(quarterPeriodOf(new Date(template.created_at)));
  }
  return template.last_handled_period
    ? nextMonthPeriod(template.last_handled_period)
    : nextMonthPeriod(monthPeriodOf(new Date(template.created_at)));
}

// Whether a management-fee template is due, and if so, the charge it
// should produce - always describing the period one cycle ahead of the
// trigger date (a reminder is for the month/quarter right after the one
// it fires in), matching the "bill a month/quarter ahead" rule she set.
//
// The period considered is always the one right after last_handled_period
// (or, before it's ever been handled, right after the template's own
// creation month/quarter) - never recomputed from "today". Once that
// period's trigger date has passed, it stays due - shown every time this
// runs - until she explicitly confirms or skips it (which advances
// last_handled_period to it). A period is never silently skipped just
// because she didn't happen to open the app on its exact trigger day.
export function computeDueManagementFee(template: FeeTemplateInput, today: Date): DueManagementFee | null {
  if (!template.active) return null;

  const period = firstCandidatePeriod(template);

  if (template.frequency === "quarterly") {
    const triggerDate = quarterlyTriggerDateFor(period);
    if (today < triggerDate) return null;
    const [, qNumStr] = period.split("-Q");
    const qNum = Number(qNumStr);
    const qStartMonthIndex0 = (qNum - 1) * 3;
    const qEndMonthIndex0 = qStartMonthIndex0 + 2;
    return {
      templateId: template.id,
      boatId: template.boat_id,
      amount: template.amount,
      description: `${template.charge_label} Q${qNum} (${MONTH_SHORT[qStartMonthIndex0]}-${MONTH_SHORT[qEndMonthIndex0]})`,
      period,
    };
  }

  const triggerDate = monthlyTriggerDateFor(period, template);
  if (today < triggerDate) return null;
  const [yearStr, targetMonthStr] = period.split("-");
  const targetMonthIndex0 = Number(targetMonthStr) - 1;
  // Storage fees bill in arrears (for the month that's just ending), unlike
  // management fees which bill in advance (for the month about to start) -
  // same period/trigger-date timing either way (still fires and advances
  // exactly like every other monthly template), only the month named in
  // the description is shifted back one.
  const displayMonthIndex0 =
    template.charge_label === "Storage fees" ? new Date(Number(yearStr), targetMonthIndex0 - 1, 1).getMonth() : targetMonthIndex0;
  return {
    templateId: template.id,
    boatId: template.boat_id,
    amount: template.amount,
    description: `${template.charge_label} ${MONTH_NAMES[displayMonthIndex0]}`,
    period,
  };
}
