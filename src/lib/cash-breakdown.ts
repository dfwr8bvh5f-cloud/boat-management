import { round2 } from "@/lib/money";

// The "Withdrawals · Received · Expenses" line under the cash balance on a
// boat's Cash page. It used to sum every row it had fetched - pending
// "received" cash and future-dated rows included - while the balance above
// it (computeCashBalance, src/lib/balances.ts) applies stricter rules, so the
// parts could silently fail to add up to the headline. These are the same
// rules, applied to rows the page already has, so the breakdown always sums
// to the balance (src/lib/cash-breakdown.test.ts checks them against
// computeCashBalance on the same data).
//
// Callers pass non-archived rows and only cash-paid, approved-or-pending,
// non-payment-plan expenses (what the page already queries).
export function cashBreakdown(
  cashTx: { type: string; status: string; tx_date: string | null; amount: number }[],
  cashExpenses: { amount: number; expense_date: string | null }[],
  asOf: string
) {
  const started = (date: string | null) => date !== null && date <= asOf;
  const withdrawals = round2(
    cashTx
      .filter((c) => c.type === "withdrawal" && (c.status === "approved" || c.status === "pending") && started(c.tx_date))
      .reduce((s, c) => s + c.amount, 0)
  );
  // "Received" cash stays approved-only: nothing has definitely happened
  // until the money is confirmed in hand.
  const received = round2(
    cashTx.filter((c) => c.type === "received" && c.status === "approved" && started(c.tx_date)).reduce((s, c) => s + c.amount, 0)
  );
  const expenses = round2(cashExpenses.filter((e) => started(e.expense_date)).reduce((s, e) => s + e.amount, 0));
  return { withdrawals, received, expenses, net: round2(withdrawals + received - expenses) };
}
