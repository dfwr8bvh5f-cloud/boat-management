import { describe, expect, it } from "vitest";
import { computeOpenDebtsTotals, isExcludedLegacySamaraCharge, SAMARA_DEBT_CUTOFF_DATE, type OpenDebtsInput } from "./mys-debts";

const empty: OpenDebtsInput = {
  samaraBoatId: undefined,
  charges: [],
  chargeSettlements: [],
  adHocCharges: [],
  adHocSettlements: [],
  invoices: [],
  invoicePayments: [],
  commissions: [],
  commissionPayments: [],
  unlinkedIncome: [],
};
const charge = (id: string, amount: number, extra: Partial<OpenDebtsInput["charges"][number]> = {}) => ({
  id,
  boat_id: "b1",
  expense_date: "2026-10-01",
  amount,
  mys_charge_settled_at: null,
  ...extra,
});

describe("computeOpenDebtsTotals", () => {
  it("counts an untouched charge in full", () => {
    expect(computeOpenDebtsTotals({ ...empty, charges: [charge("c1", 500)] }).total).toBe(500);
  });

  it("nets a partial settlement off a charge (the dashboard used to count the full amount)", () => {
    const t = computeOpenDebtsTotals({ ...empty, charges: [charge("c1", 500)], chargeSettlements: [{ expense_id: "c1", amount: 200 }] });
    expect(t.charges).toBe(300);
  });

  it("treats a legacy settled charge with no settlement rows as fully paid, not as a new debt", () => {
    const t = computeOpenDebtsTotals({ ...empty, charges: [charge("c1", 500, { mys_charge_settled_at: "2026-01-01" })] });
    expect(t.charges).toBe(0);
  });

  it("never lets an over-settled charge reduce the total below zero for that row", () => {
    const t = computeOpenDebtsTotals({ ...empty, charges: [charge("c1", 100)], chargeSettlements: [{ expense_id: "c1", amount: 150 }] });
    expect(t.charges).toBe(0);
  });

  it("excludes SAMARA charges before the cutoff but keeps those on or after it", () => {
    const base = { ...empty, samaraBoatId: "samara" };
    const before = charge("c1", 100, { boat_id: "samara", expense_date: "2026-09-14" });
    const on = charge("c2", 40, { boat_id: "samara", expense_date: SAMARA_DEBT_CUTOFF_DATE });
    const other = charge("c3", 10, { boat_id: "b2", expense_date: "2026-01-01" });
    expect(computeOpenDebtsTotals({ ...base, charges: [before, on, other] }).charges).toBe(50);
    expect(isExcludedLegacySamaraCharge({ boat_id: "samara", expense_date: null }, "samara")).toBe(true);
    expect(isExcludedLegacySamaraCharge({ boat_id: "samara", expense_date: "2026-09-14" }, undefined)).toBe(false);
  });

  it("ad-hoc charges: paid legacy status is fully paid, partial settlements net off", () => {
    const t = computeOpenDebtsTotals({
      ...empty,
      adHocCharges: [
        { id: "a1", amount: 100, status: "paid" },
        { id: "a2", amount: 100, status: "unpaid" },
      ],
      adHocSettlements: [{ ad_hoc_charge_id: "a2", amount: 30 }],
    });
    expect(t.adHoc).toBe(70);
  });

  it("invoices: remaining is total + VAT minus payments, without float drift", () => {
    const t = computeOpenDebtsTotals({
      ...empty,
      invoices: [{ id: "i1", amount: 0.1, vat_amount: 0.2 }],
      invoicePayments: [{ invoice_id: "i1", amount: 0.3 }],
    });
    expect(t.invoices).toBe(0);
    const partial = computeOpenDebtsTotals({
      ...empty,
      invoices: [{ id: "i1", amount: 1000, vat_amount: 240 }],
      invoicePayments: [{ invoice_id: "i1", amount: 500 }],
    });
    expect(partial.invoices).toBe(740);
  });

  it("includes unpaid supplier commissions net of their payments", () => {
    const t = computeOpenDebtsTotals({
      ...empty,
      commissions: [{ id: "k1", total_amount: 300 }],
      commissionPayments: [{ commission_id: "k1", amount: 100 }],
    });
    expect(t.commissions).toBe(200);
  });

  it("nets unlinked income credits off the total and ignores credits with no client", () => {
    const t = computeOpenDebtsTotals({
      ...empty,
      charges: [charge("c1", 500)],
      unlinkedIncome: [
        { client_name: "X", amount: 120 },
        { client_name: null, amount: 999 },
      ],
    });
    expect(t.credits).toBe(120);
    expect(t.total).toBe(380);
  });

  it("combines every kind into one total", () => {
    const t = computeOpenDebtsTotals({
      ...empty,
      charges: [charge("c1", 100)],
      adHocCharges: [{ id: "a1", amount: 50, status: "unpaid" }],
      invoices: [{ id: "i1", amount: 200, vat_amount: 0 }],
      commissions: [{ id: "k1", total_amount: 25 }],
      unlinkedIncome: [{ client_name: "X", amount: 75 }],
    });
    expect(t.total).toBe(300);
  });
});
