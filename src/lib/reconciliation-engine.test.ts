import { describe, expect, it } from "vitest";
import { reconcile, isBankFeeDescription, normalizeDescription, type AppTxn, type BankTxn } from "./reconciliation-engine";

function bank(overrides: Partial<BankTxn> & Pick<BankTxn, "id" | "amount" | "date">): BankTxn {
  return {
    recordType: "expense",
    currency: "EUR",
    description: "",
    ...overrides,
  };
}

function app(overrides: Partial<AppTxn> & Pick<AppTxn, "id" | "amount" | "date">): AppTxn {
  return {
    recordType: "expense",
    currency: "EUR",
    description: "",
    ...overrides,
  };
}

describe("reconcile - exact deterministic matching (never sent to AI, must always win first)", () => {
  it("matches same amount + same date + same currency as 'matched' with full confidence", () => {
    const results = reconcile(
      [bank({ id: "b1", amount: 120, date: "2025-06-01" })],
      [app({ id: "a1", amount: 120, date: "2025-06-01" })]
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("matched");
    expect(results[0].confidence).toBe(100);
    expect(results[0].differenceAmount).toBe(0);
  });

  it("never matches records with different currencies, even with identical amount and date", () => {
    const results = reconcile(
      [bank({ id: "b1", amount: 100, date: "2025-06-01", currency: "USD" })],
      [app({ id: "a1", amount: 100, date: "2025-06-01", currency: "EUR" })]
    );
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.status).sort()).toEqual(["missing_in_app", "missing_in_bank"]);
  });

  it("never matches records with different amounts, even by a cent", () => {
    const results = reconcile(
      [bank({ id: "b1", amount: 100, date: "2025-06-01" })],
      [app({ id: "a1", amount: 100.01, date: "2025-06-01" })]
    );
    // Falls to the amount-typo tier (needs_review), not an exact match.
    expect(results).toHaveLength(1);
    expect(results[0].status).not.toBe("matched");
  });

  it("a same-day exact match always wins over a further-out exact-amount candidate", () => {
    const results = reconcile(
      [bank({ id: "b1", amount: 50, date: "2025-06-10" })],
      [
        app({ id: "a-far", amount: 50, date: "2025-06-03" }),
        app({ id: "a-same-day", amount: 50, date: "2025-06-10" }),
      ]
    );
    const matched = results.find((r) => r.status === "matched");
    expect(matched?.appItems[0].id).toBe("a-same-day");
    // The other app record must still be reported as missing, not silently dropped.
    expect(results.some((r) => r.status === "missing_in_bank" && r.appItems[0]?.id === "a-far")).toBe(true);
  });
});

describe("reconcile - cash exclusion (cash expenses never appear on a bank statement)", () => {
  it("cash-excluded app records are pulled out entirely and never reported as a gap", () => {
    const results = reconcile(
      [],
      [app({ id: "a1", amount: 40, date: "2025-06-01", isCashExcluded: true })]
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("excluded_cash");
  });
});

describe("reconcile - bank fees (auto-recognized, excluded from 'missing' reporting)", () => {
  it("a bank-fee line with no app counterpart is classified bank_fee, not missing_in_app", () => {
    const results = reconcile(
      [bank({ id: "b1", amount: 5, date: "2025-06-01", description: "Bank commission" })],
      []
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("bank_fee");
  });

  it("a fee-worded line still matches normally if the user did enter a corresponding record", () => {
    const results = reconcile(
      [bank({ id: "b1", amount: 5, date: "2025-06-01", description: "Bank commission" })],
      [app({ id: "a1", amount: 5, date: "2025-06-01", description: "bank fee" })]
    );
    expect(results[0].status).toBe("matched");
  });

  it("isBankFeeDescription recognizes English and Hebrew fee wording", () => {
    expect(isBankFeeDescription("Bank commission")).toBe(true);
    expect(isBankFeeDescription("עמלת בנק")).toBe(true);
    expect(isBankFeeDescription("Coffee shop purchase")).toBe(false);
  });

  // Fixed after being flagged as a known gap and explicitly approved by the
  // user: real Greek bank statements are written with the standard
  // monotonic accent (τόνος), so the pattern must match "προμήθεια"
  // (correctly accented), not just the unaccented "προμηθεια".
  it("recognizes both accented and unaccented Greek fee wording", () => {
    expect(isBankFeeDescription("προμηθεια")).toBe(true); // unaccented
    expect(isBankFeeDescription("προμήθεια")).toBe(true); // accented (the real spelling)
  });
});

describe("reconcile - genuine gaps", () => {
  it("a bank line with no candidate at all is missing_in_app", () => {
    const results = reconcile([bank({ id: "b1", amount: 300, date: "2025-06-01" })], []);
    expect(results).toEqual([
      expect.objectContaining({ status: "missing_in_app", differenceAmount: 300 }),
    ]);
  });

  it("an app record with no candidate at all is missing_in_bank", () => {
    const results = reconcile([], [app({ id: "a1", amount: 300, date: "2025-06-01" })]);
    expect(results).toEqual([
      expect.objectContaining({ status: "missing_in_bank", differenceAmount: -300 }),
    ]);
  });
});

describe("reconcile - duplicate detection", () => {
  it("flags two same-amount, same-day app records left unmatched as possible_duplicate, grouped once", () => {
    const results = reconcile(
      [],
      [
        app({ id: "a1", amount: 75, date: "2025-06-01" }),
        app({ id: "a2", amount: 75, date: "2025-06-01" }),
      ]
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("possible_duplicate");
    expect(results[0].appItems.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
  });
});

describe("reconcile - split matching", () => {
  it("finds two app records that sum to one bank line", () => {
    const results = reconcile(
      [bank({ id: "b1", amount: 150, date: "2025-06-01" })],
      [
        app({ id: "a1", amount: 100, date: "2025-06-01" }),
        app({ id: "a2", amount: 50, date: "2025-06-01" }),
      ]
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("possible_split_match");
    expect(results[0].appItems.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
  });
});

describe("normalizeDescription", () => {
  it("strips boilerplate words and punctuation, keeping the identifying part", () => {
    expect(normalizeDescription("POS PURCHASE - Disney Store")).toBe("disney store");
  });
});
