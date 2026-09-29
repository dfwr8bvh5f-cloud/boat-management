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
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeDueManagementFee", () => {
  describe("monthly, never handled yet (anchored to created_at)", () => {
    it("does not fire before the default lead-days trigger", () => {
      expect(computeDueManagementFee(template({ created_at: "2026-08-01T00:00:00.000Z" }), new Date(2026, 7, 26))).toBeNull(); // Aug 26
    });

    it("fires on the default lead-days trigger (4 days before the creation month ends)", () => {
      const due = computeDueManagementFee(template({ created_at: "2026-08-01T00:00:00.000Z" }), new Date(2026, 7, 27)); // Aug 27 (Aug has 31 days)
      expect(due).toEqual({
        templateId: "t1",
        boatId: "b1",
        amount: 500,
        description: "Management fees September",
        period: "2026-09",
      });
    });

    it("keeps firing the same period every later day of that month too", () => {
      expect(computeDueManagementFee(template({ created_at: "2026-08-01T00:00:00.000Z" }), new Date(2026, 7, 30))?.period).toBe("2026-09");
    });

    it("stays due (same period) even after the calendar month has rolled over, if never handled", () => {
      const due = computeDueManagementFee(template({ created_at: "2026-08-01T00:00:00.000Z" }), new Date(2026, 8, 15)); // Sep 15
      expect(due?.period).toBe("2026-09");
      expect(due?.description).toBe("Management fees September");
    });

    it("adapts the lead day to a shorter month (February)", () => {
      const due = computeDueManagementFee(template({ created_at: "2026-02-05T00:00:00.000Z" }), new Date(2026, 1, 24)); // Feb 24 (Feb has 28 days)
      expect(due?.description).toBe("Management fees March");
    });

    it("rolls the target month/year over correctly across a December trigger", () => {
      const due = computeDueManagementFee(template({ created_at: "2026-12-01T00:00:00.000Z" }), new Date(2026, 11, 27)); // Dec 27, 2026
      expect(due?.description).toBe("Management fees January");
      expect(due?.period).toBe("2027-01");
    });
  });

  describe("monthly, fixed trigger_day (MA BELLE, day 10)", () => {
    it("does not fire before that day", () => {
      expect(
        computeDueManagementFee(template({ created_at: "2026-08-01T00:00:00.000Z", trigger_day: 10 }), new Date(2026, 7, 9))
      ).toBeNull();
    });

    it("fires on that day, and stays due on later days too", () => {
      const base = template({ created_at: "2026-08-01T00:00:00.000Z", trigger_day: 10 });
      expect(computeDueManagementFee(base, new Date(2026, 7, 10))?.description).toBe("Management fees September");
      expect(computeDueManagementFee(base, new Date(2026, 7, 20))?.description).toBe("Management fees September");
    });
  });

  describe("monthly, already handled at least once", () => {
    it("is not due again until the next period's own trigger day", () => {
      expect(computeDueManagementFee(template({ last_handled_period: "2026-09" }), new Date(2026, 8, 20))).toBeNull(); // Sep 20, before Sep 26
    });

    it("becomes due for the next period once its trigger day arrives", () => {
      const due = computeDueManagementFee(template({ last_handled_period: "2026-09" }), new Date(2026, 8, 26)); // Sep 26
      expect(due?.period).toBe("2026-10");
      expect(due?.description).toBe("Management fees October");
    });
  });

  it("never fires an inactive template", () => {
    expect(computeDueManagementFee(template({ active: false, created_at: "2026-08-01T00:00:00.000Z" }), new Date(2026, 8, 15))).toBeNull();
  });

  describe("quarterly (MINTU)", () => {
    it("does not fire before the trigger date", () => {
      expect(
        computeDueManagementFee(template({ frequency: "quarterly", created_at: "2026-04-01T00:00:00.000Z" }), new Date(2026, 5, 29))
      ).toBeNull(); // Jun 29
    });

    it("fires on the last day of the month before the quarter starts", () => {
      const due = computeDueManagementFee(template({ frequency: "quarterly", created_at: "2026-04-01T00:00:00.000Z" }), new Date(2026, 5, 30)); // Jun 30
      expect(due).toEqual({
        templateId: "t1",
        boatId: "b1",
        amount: 500,
        description: "Management fees Q3 (Jul-Sep)",
        period: "2026-Q3",
      });
    });

    it("stays due (same period) well after its trigger date, if never handled", () => {
      const due = computeDueManagementFee(template({ frequency: "quarterly", created_at: "2026-04-01T00:00:00.000Z" }), new Date(2026, 8, 29)); // Sep 29
      expect(due?.period).toBe("2026-Q3");
    });

    it("rolls the quarter year over correctly across a December trigger", () => {
      const due = computeDueManagementFee(
        template({ frequency: "quarterly", created_at: "2026-10-01T00:00:00.000Z" }),
        new Date(2026, 11, 31) // Dec 31, 2026
      );
      expect(due?.description).toBe("Management fees Q1 (Jan-Mar)");
      expect(due?.period).toBe("2027-Q1");
    });

    it("ignores trigger_day", () => {
      const due = computeDueManagementFee(
        template({ frequency: "quarterly", created_at: "2026-04-01T00:00:00.000Z", trigger_day: 10 }),
        new Date(2026, 5, 30) // Jun 30
      );
      expect(due?.description).toBe("Management fees Q3 (Jul-Sep)");
    });

    it("advances to the next quarter once the previous one is handled", () => {
      expect(
        computeDueManagementFee(template({ frequency: "quarterly", last_handled_period: "2026-Q3" }), new Date(2026, 8, 29)) // Sep 29, before Sep 30
      ).toBeNull();
      const due = computeDueManagementFee(template({ frequency: "quarterly", last_handled_period: "2026-Q3" }), new Date(2026, 8, 30)); // Sep 30
      expect(due?.period).toBe("2026-Q4");
    });
  });
});
