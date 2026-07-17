import { describe, expect, it } from "vitest";
import { round2, formatCurrency, formatCurrencySigned } from "./money";

describe("round2", () => {
  it("rounds to the nearest cent, fixing binary floating-point drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(19.999999)).toBe(20);
  });

  it("rounds negative numbers correctly", () => {
    expect(round2(-19.995)).toBe(-19.99);
  });
});

describe("formatCurrency", () => {
  it("formats a positive amount with the euro sign and locale grouping", () => {
    expect(formatCurrency(1234)).toBe("€1,234");
  });

  it("does not special-case negative numbers - he-IL locale inserts an invisible LRM before the minus sign, which is exactly why formatCurrencySigned exists as the alternative for values that can go negative", () => {
    expect(formatCurrency(-50)).toBe("€‎-50");
  });
});

describe("formatCurrencySigned", () => {
  it("puts the minus sign before the currency symbol for negative amounts", () => {
    expect(formatCurrencySigned(-1234)).toBe("-€1,234");
  });

  it("has no sign prefix for positive amounts", () => {
    expect(formatCurrencySigned(1234)).toBe("€1,234");
  });

  it("treats zero as non-negative", () => {
    expect(formatCurrencySigned(0)).toBe("€0");
  });
});
