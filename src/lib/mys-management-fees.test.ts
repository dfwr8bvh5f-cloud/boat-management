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
  it("fires a monthly (trigger_day=null) template on the last day of the month, for next month", () => {
    const due = computeDueManagementFee(template(), new Date(2026, 8, 30)); // Sep 30, 2026
    expect(due).toEqual({
      templateId: "t1",
      boatId: "b1",
      amount: 500,
      description: "Management fees October",
      period: "2026-10",
    });
  });

  it("does not fire a monthly template on any other day of the month", () => {
    expect(computeDueManagementFee(template(), new Date(2026, 8, 29))).toBeNull();
  });

  it("rolls the target month/year over correctly when triggered in December", () => {
    const due = computeDueManagementFee(template(), new Date(2026, 11, 31)); // Dec 31, 2026
    expect(due?.description).toBe("Management fees January");
    expect(due?.period).toBe("2027-01");
  });

  it("fires a fixed trigger_day template (MA BELLE, day 10) only on that day", () => {
    expect(computeDueManagementFee(template({ trigger_day: 10 }), new Date(2026, 8, 9))).toBeNull();
    const due = computeDueManagementFee(template({ trigger_day: 10 }), new Date(2026, 8, 10));
    expect(due?.description).toBe("Management fees October");
  });

  it("never fires again once last_handled_period matches the computed period", () => {
    expect(computeDueManagementFee(template({ last_handled_period: "2026-10" }), new Date(2026, 8, 30))).toBeNull();
  });

  it("never fires an inactive template", () => {
    expect(computeDueManagementFee(template({ active: false }), new Date(2026, 8, 30))).toBeNull();
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
