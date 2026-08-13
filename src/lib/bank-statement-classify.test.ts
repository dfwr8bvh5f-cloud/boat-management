import { describe, expect, it } from "vitest";
import { classifyLine } from "./bank-statement-classify";

describe("classifyLine - direction/type classification (never delegated to AI judgment)", () => {
  it("a positive amount is always income, regardless of description", () => {
    expect(classifyLine(120, "some deposit")).toEqual({ line_type: "income", amount: 120 });
  });

  it("a negative amount with no withdrawal wording anywhere is a plain expense", () => {
    expect(classifyLine(-42.5, "SUPERMARKET LEFKADA")).toEqual({ line_type: "expense", amount: 42.5 });
  });

  it("recognizes an ATM withdrawal from the description alone", () => {
    expect(classifyLine(-100, "ATM WITHDRAWAL")).toEqual({ line_type: "cash_withdrawal", amount: 100 });
  });

  // Confirmed in production (Piraeus Bank e-banking exports, LULU/STEPHANIE/
  // SAMARA/MINTU): the merchant description for a real cash advance is often
  // just the travel agency's name with no ATM/withdrawal wording in it at
  // all (e.g. "KINISIS TRAVEL ΛΕΥΚΑΔΑ") - the word that actually identifies
  // it as a withdrawal only appears in the statement's own separate
  // category column ("ΑΤΜ-ΑΝΑΛΗΨΗ ΜΕΤΡΗΤΩΝ"), which the AI is now asked to
  // extract alongside the description specifically so this case is caught.
  it("recognizes a cash withdrawal from the statement's own category column, even when the description has no withdrawal wording", () => {
    expect(classifyLine(-500, "KINISIS TRAVEL ΛΕΥΚΑΔΑ 0000964355-S1B95791", "ΑΤΜΑΝΑΛΗΨΗ ΜΕΤΡΗΤΩΝ")).toEqual({
      line_type: "cash_withdrawal",
      amount: 500,
    });
  });

  it("a null/absent category falls back to description-only detection without throwing", () => {
    expect(classifyLine(-30, "COFFEE SHOP", null)).toEqual({ line_type: "expense", amount: 30 });
    expect(classifyLine(-30, "COFFEE SHOP")).toEqual({ line_type: "expense", amount: 30 });
  });

  it("a category that just names an ordinary purchase type does not misfire as a withdrawal", () => {
    expect(classifyLine(-15.99, "DISNEY PLUS AMSTERDAM", "ΑΓΟΡΑ ΜΕ ΚΑΡΤΑ")).toEqual({
      line_type: "expense",
      amount: 15.99,
    });
  });
});
