import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows, fetchRowsForIds } from "@/lib/supabase/fetch-all";
import { computeOpenDebtsTotals, type OpenDebtsTotals } from "@/lib/mys-debts";
import type { Database } from "@/lib/types/database";

// Fetches exactly the rows /mys/debts builds its list from (same filters),
// then runs them through the shared computeOpenDebtsTotals so the dashboard
// KPI is the page's own total rather than a second, drifting calculation.
export async function loadOpenMysDebtsTotals(supabase: SupabaseClient<Database>): Promise<OpenDebtsTotals> {
  const [{ data: samara }, charges, adHocCharges, { data: invoices, error: invoicesError }, { data: commissions, error: commissionsError }, { data: unlinkedIncome, error: incomeError }] =
    await Promise.all([
      supabase.from("boats").select("id").eq("name", "SAMARA").maybeSingle(),
      fetchAllRows<{ id: string; boat_id: string | null; expense_date: string | null; amount: number; mys_charge_settled_at: string | null }>(
        (from, to) =>
          supabase
            .from("expenses")
            .select("id, boat_id, expense_date, amount, mys_charge_settled_at")
            .eq("paid_by", "management")
            .eq("bill_to_mys", true)
            .eq("is_payment_plan", false)
            .eq("status", "approved")
            .is("mys_invoice_id", null)
            .order("id")
            .range(from, to)
      ),
      fetchAllRows<{ id: string; amount: number; status: string }>((from, to) =>
        supabase.from("mys_ad_hoc_charges").select("id, amount, status").is("invoice_id", null).order("id").range(from, to)
      ),
      supabase.from("mys_invoices").select("id, amount, vat_amount").in("status", ["draft", "sent"]),
      supabase.from("mys_supplier_commissions").select("id, total_amount").eq("status", "unpaid"),
      supabase
        .from("mys_income")
        .select("client_name, amount")
        .is("mys_invoice_id", null)
        .is("linked_expense_id", null)
        .is("linked_ad_hoc_charge_id", null)
        .is("linked_commission_id", null)
        .not("client_name", "is", null),
    ]);
  for (const [name, error] of [["invoices", invoicesError], ["commissions", commissionsError], ["income credits", incomeError]] as const) {
    if (error) {
      console.error(`loadOpenMysDebtsTotals: ${name} query failed:`, error.message);
      throw new Error(error.message);
    }
  }

  const [chargeSettlements, adHocSettlements, invoicePayments, commissionPayments] = await Promise.all([
    fetchRowsForIds<{ expense_id: string | null; amount: number }>(
      charges.map((c) => c.id),
      (chunk) => supabase.from("mys_debt_settlements").select("expense_id, amount").in("expense_id", chunk)
    ),
    fetchRowsForIds<{ ad_hoc_charge_id: string | null; amount: number }>(
      adHocCharges.map((c) => c.id),
      (chunk) => supabase.from("mys_debt_settlements").select("ad_hoc_charge_id, amount").in("ad_hoc_charge_id", chunk)
    ),
    fetchRowsForIds<{ invoice_id: string; amount: number }>(
      (invoices ?? []).map((i) => i.id),
      (chunk) => supabase.from("mys_invoice_payments").select("invoice_id, amount").in("invoice_id", chunk)
    ),
    fetchRowsForIds<{ commission_id: string; amount: number }>(
      (commissions ?? []).map((c) => c.id),
      (chunk) => supabase.from("mys_commission_payments").select("commission_id, amount").in("commission_id", chunk)
    ),
  ]);

  return computeOpenDebtsTotals({
    samaraBoatId: samara?.id,
    charges,
    chargeSettlements,
    adHocCharges,
    adHocSettlements,
    invoices: invoices ?? [],
    invoicePayments,
    commissions: commissions ?? [],
    commissionPayments,
    unlinkedIncome: unlinkedIncome ?? [],
  });
}
