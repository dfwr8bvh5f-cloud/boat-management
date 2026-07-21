import { describe, expect, it } from "vitest";
import { computeBankBalance, computeCashBalance } from "./balances";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

// A minimal fake PostgREST-style query builder: .from(table) returns a
// chainable object whose .eq/.is/.gte/.lte progressively filter an
// in-memory fixture, and .range() (the terminal call fetchAllRows always
// makes) resolves the filtered rows - just enough of the real client's
// shape for balances.ts's own query chains to run against real fixture
// data, without touching a network or a real database.
function fakeSupabase(tables: Record<string, Record<string, unknown>[]>) {
  const from = (table: string) => {
    let rows = tables[table] ?? [];
    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        rows = rows.filter((r) => r[col] === val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        rows = rows.filter((r) => vals.includes(r[col]));
        return builder;
      },
      is(col: string, val: null) {
        rows = rows.filter((r) => (r[col] ?? null) === val);
        return builder;
      },
      gte(col: string, val: string) {
        rows = rows.filter((r) => (r[col] as string) >= val);
        return builder;
      },
      lte(col: string, val: string) {
        rows = rows.filter((r) => (r[col] as string) <= val);
        return builder;
      },
      range(from2: number, to: number) {
        return Promise.resolve({ data: rows.slice(from2, to + 1) });
      },
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient<Database>;
}

const BOAT = "boat-1";
const OTHER_BOAT = "boat-2";

function baseExpense(overrides: Record<string, unknown>) {
  return {
    boat_id: BOAT,
    status: "approved",
    archived_at: null,
    expense_date: "2026-01-15",
    amount: 0,
    payment_method: "card",
    ...overrides,
  };
}
function baseIncome(overrides: Record<string, unknown>) {
  return {
    boat_id: BOAT,
    status: "approved",
    archived_at: null,
    type: "actual",
    income_date: "2026-01-15",
    amount: 0,
    ...overrides,
  };
}
function baseCashTx(overrides: Record<string, unknown>) {
  return {
    boat_id: BOAT,
    status: "approved",
    archived_at: null,
    type: "withdrawal",
    tx_date: "2026-01-15",
    amount: 0,
    ...overrides,
  };
}

describe("computeBankBalance / computeCashBalance - core accounting rules", () => {
  it("a bank-transfer expense reduces the bank balance and never touches cash", async () => {
    const supabase = fakeSupabase({
      expenses: [baseExpense({ amount: 1000, payment_method: "bank_transfer" })],
      incomes: [],
      cash_transactions: [],
    });
    expect(await computeBankBalance(supabase, BOAT)).toBe(-1000);
    expect(await computeCashBalance(supabase, BOAT)).toBe(0);
  });

  it("a card expense reduces the bank balance and never touches cash", async () => {
    const supabase = fakeSupabase({
      expenses: [baseExpense({ amount: 500, payment_method: "card" })],
      incomes: [],
      cash_transactions: [],
    });
    expect(await computeBankBalance(supabase, BOAT)).toBe(-500);
    expect(await computeCashBalance(supabase, BOAT)).toBe(0);
  });

  it("a cash withdrawal reduces the bank balance and increases the cash balance by the same amount, and is never counted as an expense", async () => {
    const supabase = fakeSupabase({
      expenses: [],
      incomes: [],
      cash_transactions: [baseCashTx({ amount: 2000, type: "withdrawal" })],
    });
    expect(await computeBankBalance(supabase, BOAT)).toBe(-2000);
    expect(await computeCashBalance(supabase, BOAT)).toBe(2000);
    // The withdrawal itself never appears in the expenses table at all -
    // computeBankBalance only ever subtracts expenses with a bank/card
    // payment method, so a withdrawal (which lives exclusively in
    // cash_transactions) structurally cannot double as a business expense.
  });

  it("a cash expense reduces the cash balance and never reduces the bank balance again", async () => {
    const supabase = fakeSupabase({
      // The prior withdrawal that funded this cash expense.
      cash_transactions: [baseCashTx({ amount: 2000, type: "withdrawal" })],
      expenses: [baseExpense({ amount: 300, payment_method: "cash" })],
      incomes: [],
    });
    expect(await computeCashBalance(supabase, BOAT)).toBe(2000 - 300);
    // Bank was already reduced when the €2000 was withdrawn - the €300 cash
    // expense must not reduce it a second time.
    expect(await computeBankBalance(supabase, BOAT)).toBe(-2000);
  });

  it("editing an expense from card to cash reverses the bank effect and applies the amount to cash instead", async () => {
    const cardVersion = fakeSupabase({
      expenses: [baseExpense({ amount: 400, payment_method: "card" })],
      incomes: [],
      cash_transactions: [],
    });
    expect(await computeBankBalance(cardVersion, BOAT)).toBe(-400);
    expect(await computeCashBalance(cardVersion, BOAT)).toBe(0);

    const cashVersion = fakeSupabase({
      expenses: [baseExpense({ amount: 400, payment_method: "cash" })],
      incomes: [],
      cash_transactions: [],
    });
    expect(await computeBankBalance(cashVersion, BOAT)).toBe(0);
    expect(await computeCashBalance(cashVersion, BOAT)).toBe(-400);
  });

  it("deleting an expense (absent from the fixture) reverses its previous accounting effect", async () => {
    const withExpense = fakeSupabase({
      expenses: [baseExpense({ amount: 250, payment_method: "bank_transfer" })],
      incomes: [],
      cash_transactions: [],
    });
    expect(await computeBankBalance(withExpense, BOAT)).toBe(-250);

    const afterDelete = fakeSupabase({ expenses: [], incomes: [], cash_transactions: [] });
    expect(await computeBankBalance(afterDelete, BOAT)).toBe(0);
  });

  it("archiving an expense (soft-delete) reverses its effect exactly like a hard delete does", async () => {
    const supabase = fakeSupabase({
      expenses: [baseExpense({ amount: 250, payment_method: "bank_transfer", archived_at: "2026-02-01T00:00:00Z" })],
      incomes: [],
      cash_transactions: [],
    });
    expect(await computeBankBalance(supabase, BOAT)).toBe(0);
  });

  it("transactions belonging to another boat are never included in this boat's balance", async () => {
    const supabase = fakeSupabase({
      expenses: [
        baseExpense({ amount: 100, payment_method: "card" }),
        baseExpense({ boat_id: OTHER_BOAT, amount: 99999, payment_method: "card" }),
      ],
      incomes: [
        baseIncome({ amount: 50 }),
        baseIncome({ boat_id: OTHER_BOAT, amount: 88888 }),
      ],
      cash_transactions: [],
    });
    expect(await computeBankBalance(supabase, BOAT)).toBe(50 - 100);
  });

  it("pending expenses do not affect the live balance - only approved ones do", async () => {
    const supabase = fakeSupabase({
      expenses: [baseExpense({ amount: 300, payment_method: "card", status: "pending" })],
      incomes: [],
      cash_transactions: [],
    });
    expect(await computeBankBalance(supabase, BOAT)).toBe(0);
  });

  it("future (projected) income never affects the live bank balance, only actual income does", async () => {
    const supabase = fakeSupabase({
      expenses: [],
      incomes: [baseIncome({ amount: 5000, type: "future" })],
      cash_transactions: [],
    });
    expect(await computeBankBalance(supabase, BOAT)).toBe(0);
  });

  it("an expense with no recognized payment method affects neither balance (flagged separately as a data-quality issue, not silently guessed)", async () => {
    const supabase = fakeSupabase({
      expenses: [baseExpense({ amount: 1000, payment_method: "other" })],
      incomes: [],
      cash_transactions: [],
    });
    expect(await computeBankBalance(supabase, BOAT)).toBe(0);
    expect(await computeCashBalance(supabase, BOAT)).toBe(0);
  });

  it("asOf limits the balance to transactions on or before that date", async () => {
    const supabase = fakeSupabase({
      expenses: [
        baseExpense({ amount: 100, payment_method: "card", expense_date: "2026-01-01" }),
        baseExpense({ amount: 200, payment_method: "card", expense_date: "2026-03-01" }),
      ],
      incomes: [],
      cash_transactions: [],
    });
    expect(await computeBankBalance(supabase, BOAT, "2026-02-01")).toBe(-100);
    expect(await computeBankBalance(supabase, BOAT, "2026-12-31")).toBe(-300);
  });
});
