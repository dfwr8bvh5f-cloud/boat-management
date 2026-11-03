import { describe, expect, it } from "vitest";
import { round2, formatAmount, formatCurrency, formatCurrencySigned } from "./money";

describe("round2", () => {
  it("rounds to the nearest cent, fixing binary floating-point drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(19.999999)).toBe(20);
  });

  it("rounds negative numbers correctly", () => {
    expect(round2(-19.995)).toBe(-19.99);
  });
});

describe("formatAmount", () => {
  it("always shows exactly two decimals", () => {
    expect(formatAmount(86)).toBe("86.00");
    expect(formatAmount(1284.5)).toBe("1,284.50");
    expect(formatAmount(42350.75)).toBe("42,350.75");
  });

  it("formats the absolute value (the sign is added by formatCurrency)", () => {
    expect(formatAmount(-5)).toBe("5.00");
  });
});

describe("formatCurrency", () => {
  it("formats a positive amount with the euro sign, grouping and two decimals", () => {
    expect(formatCurrency(1234)).toBe("€1,234.00");
    expect(formatCurrency(1284.5)).toBe("€1,284.50");
  });

  it("puts the minus sign before the euro sign for negative amounts, with no invisible bidi marks", () => {
    expect(formatCurrency(-50)).toBe("-€50.00");
    expect(formatCurrency(-4035.66)).toBe("-€4,035.66");
  });

  it("does not show a minus for a value that rounds to zero", () => {
    expect(formatCurrency(-0.001)).toBe("€0.00");
  });
});

describe("formatCurrencySigned", () => {
  it("matches formatCurrency (negative sign before the currency symbol)", () => {
    expect(formatCurrencySigned(-1234)).toBe("-€1,234.00");
  });

  it("has no sign prefix for positive amounts", () => {
    expect(formatCurrencySigned(1234)).toBe("€1,234.00");
  });

  it("treats zero as non-negative", () => {
    expect(formatCurrencySigned(0)).toBe("€0.00");
  });
});
