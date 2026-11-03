import { describe, expect, it } from "vitest";
import { isManagedInMysDebts } from "./expense-managed";

const base = { paid_by: "management", bill_to_mys: true, status: "approved", is_payment_plan: false, parent_expense_id: null };

describe("isManagedInMysDebts", () => {
  it("is true for an approved management-paid expense billed to MYS (a debt on /mys/debts)", () => {
    expect(isManagedInMysDebts(base)).toBe(true);
  });
  it("is false for a crew-paid expense", () => {
    expect(isManagedInMysDebts({ ...base, paid_by: "crew" })).toBe(false);
  });
  it("is false when it is a routine cost not billed back", () => {
    expect(isManagedInMysDebts({ ...base, bill_to_mys: false })).toBe(false);
  });
  it("is false while still pending approval (not a debt yet, still editable/rejectable)", () => {
    expect(isManagedInMysDebts({ ...base, status: "pending" })).toBe(false);
  });
  it("is false for a payment plan or one of its payments (never listed as a debt)", () => {
    expect(isManagedInMysDebts({ ...base, is_payment_plan: true })).toBe(false);
    expect(isManagedInMysDebts({ ...base, parent_expense_id: "p1" })).toBe(false);
  });
});
