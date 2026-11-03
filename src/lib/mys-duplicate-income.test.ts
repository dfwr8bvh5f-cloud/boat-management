import { describe, expect, it } from "vitest";
import { findDuplicateIncomeCandidates, type UnlinkedIncomeRow } from "./mys-duplicate-income";

const row = (over: Partial<UnlinkedIncomeRow> = {}): UnlinkedIncomeRow => ({
  id: "i1",
  client_name: "ROGA LI",
  amount: 500,
  income_date: "2026-10-29",
  description: "Sails - Pre payment",
  ...over,
});

describe("findDuplicateIncomeCandidates", () => {
  it("finds an unlinked income with the same client and exactly the same amount", () => {
    expect(findDuplicateIncomeCandidates([row()], "ROGA LI", 500)).toHaveLength(1);
  });

  it("ignores case and surrounding spaces in the client name", () => {
    expect(findDuplicateIncomeCandidates([row()], "  roga li ", 500)).toHaveLength(1);
  });

  it("does not match a different amount (no near-matches, no guessing)", () => {
    expect(findDuplicateIncomeCandidates([row()], "ROGA LI", 500.01)).toHaveLength(0);
    expect(findDuplicateIncomeCandidates([row()], "ROGA LI", 400)).toHaveLength(0);
  });

  it("does not match another client", () => {
    expect(findDuplicateIncomeCandidates([row()], "MINTU", 500)).toHaveLength(0);
  });

  it("compares amounts after rounding to cents", () => {
    expect(findDuplicateIncomeCandidates([row({ amount: 0.1 + 0.2 })], "ROGA LI", 0.3)).toHaveLength(1);
  });

  it("returns nothing for a zero/negative amount or empty client", () => {
    expect(findDuplicateIncomeCandidates([row()], "ROGA LI", 0)).toHaveLength(0);
    expect(findDuplicateIncomeCandidates([row()], "", 500)).toHaveLength(0);
  });

  it("returns every candidate when there is more than one", () => {
    expect(findDuplicateIncomeCandidates([row({ id: "a" }), row({ id: "b" })], "ROGA LI", 500).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
