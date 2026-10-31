import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCashBalance } from "./balances";
import { cashBreakdown } from "./cash-breakdown";
import type { Database } from "@/lib/types/database";

// Same minimal PostgREST-style fake as balances.test.ts.
function fakeSupabase(tables: Record<string, Record<string, unknown>[]>) {
  const from = (table: string) => {
    let rows = tables[table] ?? [];
    const b = {
      select: () => b,
      eq(c: string, v: unknown) { rows = rows.filter((r) => r[c] === v); return b; },
      in(c: string, vs: unknown[]) { rows = rows.filter((r) => vs.includes(r[c])); return b; },
      is(c: string, v: null) { rows = rows.filter((r) => (r[c] ?? null) === v); return b; },
      lte(c: string, v: string) { rows = rows.filter((r) => (r[c] as string) <= v); return b; },
      range(a: number, z: number) { return Promise.resolve({ data: rows.slice(a, z + 1) }); },
    };
    return b;
  };
  return { from } as unknown as SupabaseClient<Database>;
}

const TODAY = "2026-06-15";
const tx = (o: Record<string, unknown>) => ({ boat_id: "b", archived_at: null, status: "approved", type: "withdrawal", tx_date: "2026-05-01", amount: 0, ...o });
const exp = (o: Record<string, unknown>) => ({ boat_id: "b", archived_at: null, status: "approved", payment_method: "cash", is_payment_plan: false, expense_date: "2026-05-01", amount: 0, ...o });

describe("cashBreakdown", () => {
  const cashTx = [
    tx({ amount: 1000 }),
    tx({ amount: 300, status: "pending" }), // pending withdrawal counts
    tx({ amount: 200, type: "received" }),
    tx({ amount: 999, type: "received", status: "pending" }), // pending received does NOT count
    tx({ amount: 500, tx_date: "2026-07-01" }), // future-dated: not yet
    tx({ amount: 40, tx_date: null }), // undated: never counted
  ];
  const cashExpenses = [exp({ amount: 450 }), exp({ amount: 80, status: "pending" }), exp({ amount: 60, expense_date: "2026-08-01" })];

  it("applies the balance rules to each part", () => {
    const b = cashBreakdown(cashTx, cashExpenses, TODAY);
    expect(b).toEqual({ withdrawals: 1300, received: 200, expenses: 530, net: 970 });
  });

  it("always sums to exactly what computeCashBalance reports for the same data", async () => {
    const supabase = fakeSupabase({
      cash_transactions: cashTx,
      expenses: cashExpenses,
    });
    // computeCashBalance defaults its cutoff to today, so pass TODAY explicitly.
    const balance = await computeCashBalance(supabase, "b", TODAY);
    expect(cashBreakdown(cashTx, cashExpenses, TODAY).net).toBe(balance);
  });
});
