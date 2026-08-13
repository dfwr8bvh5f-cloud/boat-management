import { describe, expect, it } from "vitest";
import { findAlreadyRecordedIndices, sameStatementLine } from "./bank-statement-dedup";

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

describe("findAlreadyRecordedIndices - re-scan of an overlapping statement", () => {
  // Confirmed in production (LULU): a statement covering March-August was
  // scanned, and a cash withdrawal done via a travel agent's card terminal
  // (KINISIS TRAVEL) got correctly saved as a cash_withdrawal line, using
  // that scan's own category-column read. Re-scanning an overlapping period
  // read the very same line again, but this time without picking up the
  // category column - which would have gotten it classified as a plain
  // "expense" and flagged as a spurious type mismatch against the already-
  // linked cash_transactions record, purely because it wasn't recognized as
  // the same line already on file.
  const existingLines = [
    { tx_date: "2026-06-25", amount: 700, description: "KINISIS TRAVEL ΛΕΥΚΑΔΑ 0000351948-S1B95791 498877XXXXX19072 16436220 / AT26176000361623" },
    { tx_date: "2026-06-02", amount: 200, description: "NIDRI CAR RENTALS ΝΥΔΡΙ 0000138686-S1B95615 498877XXXXX19072 16436220 / AT26153000354493" },
  ];

  it("recognizes a re-scanned line with an identical description as already recorded", () => {
    const lines = [
      { date: "2026-06-25", amount: 700, description: "KINISIS TRAVEL ΛΕΥΚΑΔΑ 0000351948-S1B95791 498877XXXXX19072 16436220 / AT26176000361623" },
    ];
    expect(findAlreadyRecordedIndices(lines, existingLines)).toEqual(new Set([0]));
  });

  it("recognizes a re-scanned line with a truncated/extended description as the same already-recorded line", () => {
    const lines = [{ date: "2026-06-02", amount: 200, description: "NIDRI CAR RENTALS ΝΥΔΡΙ 0000138686-S1B95615" }];
    expect(findAlreadyRecordedIndices(lines, existingLines)).toEqual(new Set([0]));
  });

  it("does not flag a genuinely new line on the same date/amount as a different description as already recorded", () => {
    const lines = [{ date: "2026-06-25", amount: 700, description: "SOME OTHER MERCHANT ENTIRELY" }];
    expect(findAlreadyRecordedIndices(lines, existingLines)).toEqual(new Set());
  });

  it("does not flag a line with a different amount or date as already recorded", () => {
    const lines = [
      { date: "2026-06-25", amount: 701, description: "KINISIS TRAVEL ΛΕΥΚΑΔΑ 0000351948-S1B95791" },
      { date: "2026-06-26", amount: 700, description: "KINISIS TRAVEL ΛΕΥΚΑΔΑ 0000351948-S1B95791" },
    ];
    expect(findAlreadyRecordedIndices(lines, existingLines)).toEqual(new Set());
  });
});
