import { describe, expect, it } from "vitest";
import { getBudgetStatus } from "./budget-metrics";

describe("getBudgetStatus", () => {
  it("under budget: remaining amount and rounded %", () => {
    const s = getBudgetStatus(1000, 104.7);
    expect(s).toMatchObject({ kind: "under", diff: 895.3, pct: 10 });
  });
  it("exactly on budget is 100% with no difference", () => {
    expect(getBudgetStatus(500, 500)).toMatchObject({ kind: "on", diff: 0, pct: 100 });
  });
  it("float noise does not turn on-budget into over/under", () => {
    expect(getBudgetStatus(0.3, 0.1 + 0.2)).toMatchObject({ kind: "on", diff: 0 });
  });
  it("over budget: overage and uncapped %", () => {
    expect(getBudgetStatus(8300, 8955.19)).toMatchObject({ kind: "over", diff: 655.19, pct: 108 });
    expect(getBudgetStatus(100, 240).pct).toBe(240);
  });
  it("spend with a zero budget is 'no_budget' with no %", () => {
    expect(getBudgetStatus(0, 120)).toMatchObject({ kind: "no_budget", pct: null });
  });
  it("no budget and no spend is 'none'", () => {
    expect(getBudgetStatus(0, 0)).toMatchObject({ kind: "none", pct: null });
  });
});
