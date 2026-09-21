import { describe, expect, it } from "vitest";
import { computeMichaliPeriodSnapshot, type MichaliReportExpense } from "./michali-period-report";

const inputs = {
  cabinCount: 0,
  fuelLiters: 0,
  fuelPricePerLiter: 0,
  laundry: 0,
  service: 0,
  transfers: 0,
  toiletries: 0,
  provisionsBuckets: {},
};

describe("computeMichaliPeriodSnapshot", () => {
  it("computes fuel total as liters x price", () => {
    const s = computeMichaliPeriodSnapshot([], { ...inputs, fuelLiters: 500, fuelPricePerLiter: 1.5 });
    expect(s.fuel.total).toBe(750);
    expect(s.grandTotal).toBe(750);
  });

  it("sums the four boat-service line items", () => {
    const s = computeMichaliPeriodSnapshot([], { ...inputs, laundry: 180, service: 450, transfers: 60, toiletries: 90 });
    expect(s.boatService.total).toBe(780);
    expect(s.grandTotal).toBe(780);
  });

  it("only sums expenses in the provisions category, bucketed by id", () => {
    const expenses: MichaliReportExpense[] = [
      { id: "1", category: "provisions", amount: 100, description: "steak" },
      { id: "2", category: "provisions", amount: 40, description: "wine" },
      { id: "3", category: "provisions", amount: 20, description: "unsorted" },
      { id: "4", category: "diesel", amount: 999, description: "should be ignored" },
    ];
    const s = computeMichaliPeriodSnapshot(expenses, { ...inputs, provisionsBuckets: { "1": "meat", "2": "drinks" } });
    expect(s.provisions.buckets.meat).toBe(100);
    expect(s.provisions.buckets.drinks).toBe(40);
    expect(s.provisions.buckets.shopping).toBe(0);
    expect(s.provisions.unassigned).toBe(20);
    expect(s.provisions.total).toBe(160);
  });

  it("sums both docking_out and base_docking as docking fees", () => {
    const expenses: MichaliReportExpense[] = [
      { id: "1", category: "docking_out", amount: 50, description: "marina A" },
      { id: "2", category: "base_docking", amount: 30, description: "home berth" },
      { id: "3", category: "diesel", amount: 999, description: "should be ignored" },
    ];
    const s = computeMichaliPeriodSnapshot(expenses, inputs);
    expect(s.docking.total).toBe(80);
  });

  it("splits the grand total per cabin, and leaves it null when there are no cabins", () => {
    const withCabins = computeMichaliPeriodSnapshot([], { ...inputs, fuelLiters: 100, fuelPricePerLiter: 2, cabinCount: 4 });
    expect(withCabins.perCabin).toBe(50);

    const withoutCabins = computeMichaliPeriodSnapshot([], { ...inputs, fuelLiters: 100, fuelPricePerLiter: 2, cabinCount: 0 });
    expect(withoutCabins.perCabin).toBeNull();
  });
});
