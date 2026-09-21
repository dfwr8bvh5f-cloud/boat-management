import type { ExpenseCategory, MichaliPeriodReportSnapshot, MichaliProvisionsBucket } from "@/lib/types/database";
import { round2 } from "@/lib/money";

export const PROVISIONS_BUCKETS: MichaliProvisionsBucket[] = ["shopping", "meat", "drinks", "fish"];

export type MichaliReportExpense = { id: string; category: ExpenseCategory | null; amount: number; description: string };

export type MichaliPeriodReportInputs = {
  cabinCount: number;
  fuelLiters: number;
  fuelPricePerLiter: number;
  laundry: number;
  service: number;
  transfers: number;
  toiletries: number;
  provisionsBuckets: Record<string, MichaliProvisionsBucket>;
};

// Single source of truth for the report's math - used both to drive the
// live calculator panel's display and to build the exact snapshot that gets
// saved to the database or exported to Excel, so those three never drift
// from each other.
export function computeMichaliPeriodSnapshot(
  expenses: MichaliReportExpense[],
  inputs: MichaliPeriodReportInputs
): MichaliPeriodReportSnapshot {
  const provisionsExpenses = expenses.filter((e) => e.category === "provisions");
  const dockingExpenses = expenses.filter((e) => e.category === "docking_out" || e.category === "base_docking");

  const fuelTotal = round2(inputs.fuelLiters * inputs.fuelPricePerLiter);
  const boatServiceTotal = round2(inputs.laundry + inputs.service + inputs.transfers + inputs.toiletries);

  const bucketTotal = (bucket: MichaliProvisionsBucket) =>
    round2(provisionsExpenses.filter((e) => inputs.provisionsBuckets[e.id] === bucket).reduce((s, e) => s + e.amount, 0));
  const buckets = Object.fromEntries(PROVISIONS_BUCKETS.map((b) => [b, bucketTotal(b)])) as Record<MichaliProvisionsBucket, number>;
  const unassigned = round2(provisionsExpenses.filter((e) => !inputs.provisionsBuckets[e.id]).reduce((s, e) => s + e.amount, 0));
  const provisionsTotal = round2(provisionsExpenses.reduce((s, e) => s + e.amount, 0));

  const dockingTotal = round2(dockingExpenses.reduce((s, e) => s + e.amount, 0));

  const grandTotal = round2(fuelTotal + boatServiceTotal + provisionsTotal + dockingTotal);
  const perCabin = inputs.cabinCount > 0 ? round2(grandTotal / inputs.cabinCount) : null;

  return {
    cabinCount: inputs.cabinCount,
    fuel: { liters: inputs.fuelLiters, pricePerLiter: inputs.fuelPricePerLiter, total: fuelTotal },
    boatService: {
      laundry: inputs.laundry,
      service: inputs.service,
      transfers: inputs.transfers,
      toiletries: inputs.toiletries,
      total: boatServiceTotal,
    },
    provisions: {
      total: provisionsTotal,
      buckets,
      unassigned,
      lines: provisionsExpenses.map((e) => ({
        description: e.description,
        amount: e.amount,
        bucket: inputs.provisionsBuckets[e.id] ?? null,
      })),
    },
    docking: { total: dockingTotal, lines: dockingExpenses.map((e) => ({ description: e.description, amount: e.amount })) },
    grandTotal,
    perCabin,
  };
}

export type MichaliPeriodReportLabels = {
  fuel: string;
  fuelLiters: string;
  fuelPrice: string;
  boatService: string;
  laundry: string;
  service: string;
  transfers: string;
  toiletries: string;
  provisions: string;
  shopping: string;
  meat: string;
  drinks: string;
  fish: string;
  unassigned: string;
  docking: string;
  total: string;
  grandTotal: string;
  perCabin: string;
  cabinCount: string;
};

