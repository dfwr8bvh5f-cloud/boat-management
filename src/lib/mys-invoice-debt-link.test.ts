import { describe, expect, it } from "vitest";
import { checkDebtsFitInvoice, debtsForInvoice } from "./mys-invoice-debt-link";

describe("checkDebtsFitInvoice", () => {
  it("accepts supplier payments below the invoice gross", () => {
    const r = checkDebtsFitInvoice({ invoiceAmount: 1000, invoiceVat: 240, alreadyAttached: 300, selected: 500 });
    expect(r).toEqual({ ok: true, invoiceGross: 1240, attached: 800, remaining: 440 });
  });
  it("accepts exactly the gross amount", () => {
    expect(checkDebtsFitInvoice({ invoiceAmount: 1000, invoiceVat: 0, alreadyAttached: 400, selected: 600 }).ok).toBe(true);
  });
  it("refuses payments above the invoice, to the cent", () => {
    const r = checkDebtsFitInvoice({ invoiceAmount: 1000, invoiceVat: 0, alreadyAttached: 400, selected: 600.01 });
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(-0.01);
  });
  it("refuses an empty selection", () => {
    expect(checkDebtsFitInvoice({ invoiceAmount: 1000, invoiceVat: 0, alreadyAttached: 0, selected: 0 }).ok).toBe(false);
  });
});

describe("debtsForInvoice", () => {
  const debts = [
    { kind: "charge" as const, boatId: "b1", clientName: null },
    { kind: "charge" as const, boatId: "b2", clientName: null },
    { kind: "ad_hoc" as const, boatId: null, clientName: " Mocha " },
    { kind: "ad_hoc" as const, boatId: null, clientName: "Other" },
  ];
  it("keeps the invoice's boat and client only, ignoring amounts", () => {
    expect(debtsForInvoice({ boat_id: "b1", client_name: "mocha" }, debts)).toEqual([debts[0], debts[2]]);
  });
  it("never matches a boat debt to a boat-less invoice", () => {
    expect(debtsForInvoice({ boat_id: null, client_name: "x" }, debts)).toEqual([]);
  });
});
