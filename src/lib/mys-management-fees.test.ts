import { describe, expect, it } from "vitest";
import { computeDueManagementFee } from "@/lib/mys-management-fees";
import type { MysManagementFeeTemplate } from "@/lib/types/database";

function template(overrides: Partial<MysManagementFeeTemplate> = {}) {
  return {
    id: "t1",
    boat_id: "b1",
    amount: 500,
    frequency: "monthly" as const,
    trigger_day: null,
    last_handled_period: null,
    active: true,
    ...overrides,
  };
}

describe("computeDueManagementFee", () => {
  it("fires a monthly (trigger_day=null) template 4 days before the month ends, for next month", () => {
    const due = computeDueManagementFee(template(), new Date(2026, 8, 26)); // Sep 26, 2026 (Sep has 30 days)
    expect(due).toEqual({
      templateId: "t1",
      boatId: "b1",
      amount: 500,
      description: "Management fees October",
      period: "2026-10",
    });
  });

  it("does not fire a monthly template before its trigger day", () => {
    expect(computeDueManagementFee(template(), new Date(2026, 8, 25))).toBeNull();
  });

  it("keeps firing a monthly template on any day on or after its trigger day, not just the exact day", () => {
    expect(computeDueManagementFee(template(), new Date(2026, 8, 29))?.description).toBe("Management fees October");
    expect(computeDueManagementFee(template(), new Date(2026, 8, 30))?.description).toBe("Management fees October");
  });

  it("rolls the target month/year over correctly when triggered in December", () => {
    const due = computeDueManagementFee(template(), new Date(2026, 11, 27)); // Dec 27, 2026 (Dec has 31 days)
    expect(due?.description).toBe("Management fees January");
    expect(due?.period).toBe("2027-01");
  });

  it("adapts the lead day to a shorter month (February)", () => {
    const due = computeDueManagementFee(template(), new Date(2026, 1, 24)); // Feb 24, 2026 (Feb has 28 days)
    expect(due?.description).toBe("Management fees March");
  });

  it("fires a fixed trigger_day template (MA BELLE, day 10) on or after that day, not before", () => {
    expect(computeDueManagementFee(template({ trigger_day: 10 }), new Date(2026, 8, 9))).toBeNull();
    expect(computeDueManagementFee(template({ trigger_day: 10 }), new Date(2026, 8, 10))?.description).toBe("Management fees October");
    expect(computeDueManagementFee(template({ trigger_day: 10 }), new Date(2026, 8, 15))?.description).toBe("Management fees October");
  });

  it("never fires again once last_handled_period matches the computed period", () => {
    expect(computeDueManagementFee(template({ last_handled_period: "2026-10" }), new Date(2026, 8, 26))).toBeNull();
  });

  it("never fires an inactive template", () => {
    expect(computeDueManagementFee(template({ active: false }), new Date(2026, 8, 26))).toBeNull();
  });

  it("fires a quarterly template only on the last day of Mar/Jun/Sep/Dec", () => {
    expect(computeDueManagementFee(template({ frequency: "quarterly" }), new Date(2026, 8, 29))).toBeNull();
    expect(computeDueManagementFee(template({ frequency: "quarterly" }), new Date(2026, 7, 31))).toBeNull(); // Aug 31 is not a quarter end
    const due = computeDueManagementFee(template({ frequency: "quarterly" }), new Date(2026, 8, 30)); // Sep 30
    expect(due).toEqual({
      templateId: "t1",
      boatId: "b1",
      amount: 500,
      description: "Management fees Q4 (Oct-Dec)",
      period: "2026-Q4",
    });
  });

  it("rolls the quarter year over correctly when triggered in December", () => {
    const due = computeDueManagementFee(template({ frequency: "quarterly" }), new Date(2026, 11, 31)); // Dec 31, 2026
    expect(due?.description).toBe("Management fees Q1 (Jan-Mar)");
    expect(due?.period).toBe("2027-Q1");
  });

  it("ignores trigger_day for a quarterly template", () => {
    const due = computeDueManagementFee(template({ frequency: "quarterly", trigger_day: 10 }), new Date(2026, 5, 30)); // Jun 30
    expect(due?.description).toBe("Management fees Q3 (Jul-Sep)");
  });
});
