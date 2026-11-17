import { describe, expect, it } from "vitest";
import { checkDebtsFitInvoice, debtsForInvoice, invoicesWithDirectDebts } from "./mys-invoice-debt-link";

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

describe("invoicesWithDirectDebts", () => {
  it("flags invoices with a payment attached outside their own lines", () => {
    const attached = [
      { invoiceId: "inv1", debtId: "d1" },
      { invoiceId: "inv1", debtId: "d2" },
      { invoiceId: "inv2", debtId: "d3" },
    ];
    expect([...invoicesWithDirectDebts(attached, new Set(["d3"]))]).toEqual(["inv1"]);
  });
  it("ignores payments that are a line's own source", () => {
    expect(invoicesWithDirectDebts([{ invoiceId: "inv1", debtId: "d1" }], new Set(["d1"])).size).toBe(0);
  });
});
