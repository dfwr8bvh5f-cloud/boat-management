import { describe, expect, it } from "vitest";
import { sameStatementLine } from "./bank-statement-dedup";

describe("sameStatementLine - bank statement import dedup", () => {
  it("recognizes an identical description as the same line", () => {
    expect(sameStatementLine("SUPERMARKET LEFKADA", "SUPERMARKET LEFKADA")).toBe(true);
  });

  it("recognizes an identical description with different casing/punctuation as the same line", () => {
    expect(sameStatementLine("Supermarket, Lefkada.", "supermarket lefkada")).toBe(true);
  });

  // Confirmed in production (LULU): re-scanning an overlapping statement
  // period produced two slightly different reads of the exact same wire
  // transfer - one truncated at the invoice reference, one with the full
  // trailing code - which the old exact-string dedup let through as a
  // second, genuinely duplicate bank_statement_lines row.
  it("recognizes a truncated description as the same line as its fuller version", () => {
    expect(
      sameStatementLine(
        "ΥΠΕΡ SP. KARTELIAS + SIA OE WINBREM80733078",
        "ΥΠΕΡ SP. KARTELIAS + SIA OE WINBREM80733078 / F928TO6030352818"
      )
    ).toBe(true);
  });

  it("does not merge two genuinely different descriptions", () => {
    expect(sameStatementLine("KINISIS TRAVEL ΛΕΥΚΑΔΑ", "ABLE HOLIDAYS ΣΑΜΗ")).toBe(false);
  });

  it("does not merge two short, unrelated descriptions just because one is a prefix of the other", () => {
    expect(sameStatementLine("gift", "gift shop lefkada")).toBe(false);
  });
});
