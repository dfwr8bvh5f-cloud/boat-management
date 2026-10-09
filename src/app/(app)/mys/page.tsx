import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ReportKpiCard } from "@/components/report-kpi-card";
import { MysManagementFeeReminder } from "@/components/mys-management-fee-reminder";
import { getTranslator } from "@/lib/i18n/locale";
import { thisMonthYearBounds, todayLocalISO } from "@/lib/date-format";
import { formatCurrency, round2 } from "@/lib/money";
import { computeDueManagementFee } from "@/lib/mys-management-fees";

export default async function MysDashboardPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { t, locale } = await getTranslator();

  const { thisMonth, thisYear, firstOfNextMonth } = thisMonthYearBounds();

  const supabase = await createClient();

  const [
    { data: expensesThisYear },
    { data: incomeThisYear },
    { data: chargeDebts },
    { data: adHocDebts },
    { data: invoiceDebts },
    { data: feeTemplates },
  ] = await Promise.all([
    supabase
      .from("mys_expenses")
      .select("amount, expense_date")
      .gte("expense_date", `${thisYear}-01-01`)
      .lte("expense_date", `${thisYear}-12-31`),
    supabase
      .from("mys_income")
      .select("amount, income_date")
      .gte("income_date", `${thisYear}-01-01`)
      .lte("income_date", `${thisYear}-12-31`),
    supabase
      .from("expenses")
      .select("amount")
      .eq("paid_by", "management")
      .eq("bill_to_mys", true)
      .eq("is_payment_plan", false)
      .eq("status", "approved")
      .is("mys_charge_settled_at", null)
      .is("mys_invoice_id", null),
    supabase.from("mys_ad_hoc_charges").select("amount").eq("status", "unpaid").is("invoice_id", null),
    // Stays an open debt through the whole not-yet-fully-paid lifecycle -
    // see the identical comment on the same query in mys/debts/page.tsx.
    supabase.from("mys_invoices").select("id, amount, vat_amount").in("status", ["draft", "sent"]),
    // Doesn't depend on anything above (only on today's date, computed
    // locally below) - batched into this same round-trip instead of
    // running as its own sequential await afterwards.
    supabase.from("mys_management_fee_templates").select("*").eq("active", true),
  ]);

  const sum = (rows: { amount: number }[] | null) => (rows ?? []).reduce((s, r) => s + r.amount, 0);

  const expensesThisMonthRows = (expensesThisYear ?? []).filter(
    (e) => e.expense_date && e.expense_date >= thisMonth && e.expense_date < firstOfNextMonth
  );
  const incomeThisMonthRows = (incomeThisYear ?? []).filter((i) => i.income_date >= thisMonth && i.income_date < firstOfNextMonth);

  const expensesThisMonthTotal = sum(expensesThisMonthRows);
  const expensesThisYearTotal = sum(expensesThisYear);
  const incomeThisMonthTotal = sum(incomeThisMonthRows);
  const incomeThisYearTotal = sum(incomeThisYear);

  const invoiceIds = (invoiceDebts ?? []).map((i) => i.id);
  const { data: invoicePayments } =
    invoiceIds.length > 0
      ? await supabase.from("mys_invoice_payments").select("invoice_id, amount").in("invoice_id", invoiceIds)
      : { data: [] as { invoice_id: string; amount: number }[] };
  const paidByInvoiceId = new Map<string, number>();
  for (const p of invoicePayments ?? []) paidByInvoiceId.set(p.invoice_id, round2((paidByInvoiceId.get(p.invoice_id) ?? 0) + p.amount));
  // round2 both sides before subtracting (matching syncMysInvoicePaidStatus
  // and the identical fix on mys/debts/page.tsx) so a fully-paid invoice
  // can't leave a phantom near-zero remainder in this KPI total.
  const invoiceDebtsTotal = (invoiceDebts ?? []).reduce(
    (s, i) => s + Math.max(0, round2(round2(i.amount + i.vat_amount) - (paidByInvoiceId.get(i.id) ?? 0))),
    0
  );
  const outstandingDebtsTotal = sum(chargeDebts) + sum(adHocDebts) + invoiceDebtsTotal;

  // Management-fee billing reminder (see src/lib/mys-management-fees.ts) -
  // evaluated here in "today, in Athens" calendar terms (see
  // todayLocalISO's own comment on why), never the server process's own
  // timezone, so the reminder fires on the right day regardless of where
  // this happens to be deployed.
  const [todayYear, todayMonth, todayDay] = todayLocalISO().split("-").map(Number);
  const todayAthens = new Date(todayYear, todayMonth - 1, todayDay);
  const feeTemplateBoatIds = [...new Set((feeTemplates ?? []).map((tpl) => tpl.boat_id))];
  const { data: feeTemplateBoats } =
    feeTemplateBoatIds.length > 0
      ? await supabase.from("boats").select("id, name").in("id", feeTemplateBoatIds)
      : { data: [] as { id: string; name: string }[] };
  const boatNameById = new Map((feeTemplateBoats ?? []).map((b) => [b.id, b.name]));
  const dueManagementFees = (feeTemplates ?? [])
    .map((tpl) => {
      const due = computeDueManagementFee(tpl, todayAthens);
      if (!due) return null;
      return { ...due, boatName: boatNameById.get(tpl.boat_id) ?? "" };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Each due row can optionally fold in that same boat's other already-open
  // debts (see MysManagementFeeReminder's "+" button) - same source rows
  // /mys/debts itself invoices from (expenses billed to MYS with no invoice
  // yet, and unpaid ad-hoc charges), just scoped to the boats actually due
  // here rather than the whole fleet. mys_charge_settled_at must be null too
  // (not just mys_invoice_id) - a charge fully paid off directly via "Record
  // payment" on /mys/debts never gets an invoice, so that check alone left
  // an already-settled charge still offered to attach here.
  const dueBoatIds = [...new Set(dueManagementFees.map((r) => r.boatId))];
  const dueBoatNames = [...new Set(dueManagementFees.map((r) => r.boatName).filter(Boolean))];
  const [{ data: otherExpenseDebts }, { data: otherAdHocDebts }] = await Promise.all([
    dueBoatIds.length > 0
      ? supabase
          .from("expenses")
          .select("id, boat_id, description, amount")
          .in("boat_id", dueBoatIds)
          .eq("paid_by", "management")
          .eq("bill_to_mys", true)
          .eq("is_payment_plan", false)
          .eq("status", "approved")
          .is("mys_invoice_id", null)
          .is("mys_charge_settled_at", null)
      : Promise.resolve({ data: [] as { id: string; boat_id: string; description: string; amount: number }[] }),
    dueBoatNames.length > 0
      ? supabase.from("mys_ad_hoc_charges").select("id, client_name, description, amount").in("client_name", dueBoatNames).eq("status", "unpaid").is("invoice_id", null)
      : Promise.resolve({ data: [] as { id: string; client_name: string; description: string; amount: number }[] }),
  ]);
  const otherDebtsByBoatId: Record<string, { kind: "charge" | "ad_hoc"; id: string; description: string; amount: number }[]> = {};
  for (const e of otherExpenseDebts ?? []) {
    (otherDebtsByBoatId[e.boat_id] ??= []).push({ kind: "charge", id: e.id, description: e.description, amount: e.amount });
  }
  const boatIdByName = new Map((feeTemplateBoats ?? []).map((b) => [b.name, b.id]));
  for (const c of otherAdHocDebts ?? []) {
    const boatId = boatIdByName.get(c.client_name);
    if (!boatId) continue;
    (otherDebtsByBoatId[boatId] ??= []).push({ kind: "ad_hoc", id: c.id, description: c.description, amount: c.amount });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mys_dashboard_title")}</h1>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <ReportKpiCard
          label={t("mys_income_month")}
          value={formatCurrency(incomeThisMonthTotal)}
          tone="positive"
          href="/mys/income"
          compact
        />
        <ReportKpiCard
          label={t("mys_income_year")}
          value={formatCurrency(incomeThisYearTotal)}
          tone="positive"
          href="/mys/income"
          compact
        />
        <ReportKpiCard
          label={t("mys_expenses_month")}
          value={formatCurrency(expensesThisMonthTotal)}
          tone="negative"
          href="/mys/expenses"
          compact
        />
        <ReportKpiCard
          label={t("mys_expenses_year")}
          value={formatCurrency(expensesThisYearTotal)}
          tone="negative"
          href="/mys/expenses"
          compact
        />
        <ReportKpiCard label={t("mys_outstanding_debts")} value={formatCurrency(outstandingDebtsTotal)} tone="neutral" href="/mys/debts" compact />
      </div>

      <MysManagementFeeReminder dueRows={dueManagementFees} otherDebtsByBoatId={otherDebtsByBoatId} locale={locale} />
    </div>
  );
}
