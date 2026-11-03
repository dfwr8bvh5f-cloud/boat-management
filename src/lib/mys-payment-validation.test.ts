import { describe, expect, it } from "vitest";
import { missingPaymentFields } from "./mys-payment-validation";

describe("missingPaymentFields", () => {
  it("accepts a complete payment", () => {
    expect(missingPaymentFields({ amount: "100", date: "2026-10-25", method: "cash" })).toEqual([]);
  });
  it("flags every missing field", () => {
    expect(missingPaymentFields({ amount: "", date: "", method: "", categoryRequired: true })).toEqual(["amount", "date", "payment_method", "category"]);
  });
  it("rejects zero/negative amounts and only requires category when asked", () => {
    expect(missingPaymentFields({ amount: 0, date: "2026-10-25", method: "cash" })).toEqual(["amount"]);
    expect(missingPaymentFields({ amount: -5, date: "2026-10-25", method: "cash", categoryRequired: false })).toEqual(["amount"]);
  });
});
