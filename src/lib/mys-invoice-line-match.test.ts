import { describe, expect, it } from "vitest";
import { candidatesForLine, type OpenDebtForLink } from "@/lib/mys-invoice-line-match";

const inv = { boat_id: "b1", client_name: "MOKA", status: "paid" };
const debts: OpenDebtForLink[] = [
  { kind: "charge", id: "c1", boatId: "b1", clientName: null, description: "transport", amount: 992 },
  { kind: "charge", id: "c2", boatId: "b2", clientName: null, description: "other boat", amount: 992 },
  { kind: "ad_hoc", id: "a1", boatId: null, clientName: "moka", description: "anodes", amount: 800 },
];

describe("candidatesForLine", () => {
  it("matches a gross-incl-VAT line to the debt of the same boat only", () => {
    expect(candidatesForLine({ amount: 800, vat_amount: 192 }, inv, debts).map((d) => d.id)).toEqual(["c1", "a1"]);
  });
  it("never offers a debt whose amount differs by a cent", () => {
    expect(candidatesForLine({ amount: 800.01, vat_amount: 0 }, inv, debts)).toEqual([]);
  });
});
