import { round2 } from "@/lib/money";

// The single definition of "what does a client still owe MYS", shared by the
// /mys/debts page (which lists every row) and the /mys dashboard's
// "Outstanding debts" KPI (which only shows the total). The two used to each
// carry their own copy of this maths and drifted apart: the dashboard
// ignored partial payments, the SAMARA legacy-charge cutoff, unpaid supplier
// commissions and unlinked income credits, so its number was far higher than
// the page it links to. Pure functions only - callers fetch the rows.

// SAMARA's legacy management-paid charges (242 of them, all dated before
// 2026-09-15 - see PR #96) turned out not to be real MYS debts. Only SAMARA
// charges dated before this cutoff are excluded; anything from it on is a
// real debt like any other boat's (confirmed with the owner of the process).
export const SAMARA_DEBT_CUTOFF_DATE = "2026-09-15";

export function isExcludedLegacySamaraCharge(
  charge: { boat_id: string | null; expense_date: string | null },
  samaraBoatId: string | undefined
): boolean {
  if (!samaraBoatId || charge.boat_id !== samaraBoatId) return false;
  return !(charge.expense_date !== null && charge.expense_date >= SAMARA_DEBT_CUTOFF_DATE);
}

const sumAmounts = (rows: { amount: number }[]) => round2(rows.reduce((s, r) => s + r.amount, 0));

// A row settled before the mys_debt_settlements history table existed only
// recorded that via mys_charge_settled_at / status='paid' - it has no
// settlement rows to sum, so that legacy shape counts as fully paid rather
// than as $0 paid (which would resurrect every old closed charge as a new
// full-amount debt).
export function chargeRemaining(
  charge: { amount: number; mys_charge_settled_at: string | null },
  settlements: { amount: number }[]
): number {
  const paid = settlements.length === 0 && charge.mys_charge_settled_at ? charge.amount : sumAmounts(settlements);
  return round2(charge.amount - paid);
}

export function adHocRemaining(charge: { amount: number; status: string }, settlements: { amount: number }[]): number {
  const paid = settlements.length === 0 && charge.status === "paid" ? charge.amount : sumAmounts(settlements);
  return round2(charge.amount - paid);
}

// round2 both sides before subtracting (matching syncMysInvoicePaidStatus's
// own comparison) so float drift can't leave a phantom near-zero remainder
// on a fully-paid invoice.
export function invoiceRemaining(invoice: { amount: number; vat_amount: number }, paidSoFar: number): number {
  return Math.max(0, round2(round2(invoice.amount + invoice.vat_amount) - paidSoFar));
}

export function commissionRemaining(commission: { total_amount: number }, payments: { amount: number }[]): number {
  return round2(commission.total_amount - sumAmounts(payments));
}

export function groupAmountsBy<T extends { amount: number }>(rows: T[], key: (row: T) => string | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k === null) continue;
    out.set(k, round2((out.get(k) ?? 0) + r.amount));
  }
  return out;
}

export type OpenDebtsInput = {
  samaraBoatId: string | undefined;
  charges: { id: string; boat_id: string | null; expense_date: string | null; amount: number; mys_charge_settled_at: string | null }[];
  chargeSettlements: { expense_id: string | null; amount: number }[];
  adHocCharges: { id: string; amount: number; status: string }[];
  adHocSettlements: { ad_hoc_charge_id: string | null; amount: number }[];
  invoices: { id: string; amount: number; vat_amount: number }[];
  invoicePayments: { invoice_id: string; amount: number }[];
  commissions: { id: string; total_amount: number }[];
  commissionPayments: { commission_id: string; amount: number }[];
  // Income with a client but not linked to any specific debt: already a
  // credit on the client's Statement of Account, netted off the total here.
  unlinkedIncome: { client_name: string | null; amount: number }[];
};

export type OpenDebtsTotals = {
  charges: number;
  adHoc: number;
  invoices: number;
  commissions: number;
  credits: number;
  total: number;
};

export function computeOpenDebtsTotals(input: OpenDebtsInput): OpenDebtsTotals {
  const settledByExpense = new Map<string, { amount: number }[]>();
  for (const s of input.chargeSettlements) {
    if (!s.expense_id) continue;
    const arr = settledByExpense.get(s.expense_id);
    if (arr) arr.push(s);
    else settledByExpense.set(s.expense_id, [s]);
  }
  const settledByAdHoc = new Map<string, { amount: number }[]>();
  for (const s of input.adHocSettlements) {
    if (!s.ad_hoc_charge_id) continue;
    const arr = settledByAdHoc.get(s.ad_hoc_charge_id);
    if (arr) arr.push(s);
    else settledByAdHoc.set(s.ad_hoc_charge_id, [s]);
  }
  const paidByInvoice = groupAmountsBy(input.invoicePayments, (p) => p.invoice_id);
  const paymentsByCommission = new Map<string, { amount: number }[]>();
  for (const p of input.commissionPayments) {
    const arr = paymentsByCommission.get(p.commission_id);
    if (arr) arr.push(p);
    else paymentsByCommission.set(p.commission_id, [p]);
  }

  // Rows with nothing left owed contribute nothing (the page filters them
  // out of its list); a commission isn't filtered on the page, so it isn't
  // here either.
  const positive = (n: number) => (n > 0 ? n : 0);
  const charges = round2(
    input.charges
      .filter((c) => !isExcludedLegacySamaraCharge(c, input.samaraBoatId))
      .reduce((s, c) => s + positive(chargeRemaining(c, settledByExpense.get(c.id) ?? [])), 0)
  );
  const adHoc = round2(input.adHocCharges.reduce((s, c) => s + positive(adHocRemaining(c, settledByAdHoc.get(c.id) ?? [])), 0));
  const invoices = round2(input.invoices.reduce((s, i) => s + invoiceRemaining(i, paidByInvoice.get(i.id) ?? 0), 0));
  const commissions = round2(input.commissions.reduce((s, c) => s + commissionRemaining(c, paymentsByCommission.get(c.id) ?? []), 0));
  const credits = round2(input.unlinkedIncome.reduce((s, i) => (i.client_name ? s + i.amount : s), 0));

  return { charges, adHoc, invoices, commissions, credits, total: round2(charges + adHoc + invoices + commissions - credits) };
}
