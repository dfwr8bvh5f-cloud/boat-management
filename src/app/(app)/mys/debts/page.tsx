import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { MysDebtsManager } from "@/components/mys-debts-manager";
import { MysBackLink } from "@/components/mys-back-link";
import { getTranslator } from "@/lib/i18n/locale";
import { round2 } from "@/lib/money";
import type { MysInvoiceLine, MysInvoicePayment, MysDebtSettlement } from "@/lib/types/database";

export default async function MysDebtsPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();

  const [{ data: boats }, { data: charges }, { data: adHocCharges }, { data: invoices }, { data: clients }, { data: commissions }] =
    await Promise.all([
    supabase.from("boats").select("id, name").order("name"),
    supabase
      .from("expenses")
      .select("id, boat_id, description, amount, expense_date, receipt_path, photo_path, mys_charge_settled_at")
      .eq("paid_by", "management")
      .eq("is_payment_plan", false)
      .eq("status", "approved")
      // Fully-settled rows stay in this query too (not just unsettled ones)
      // - MysDebtsManager sinks them to the bottom of the list with a paid
      // indicator instead of them just vanishing, per her request. SAMARA's
      // rows are excluded separately below regardless of settled status.
      // Already combined into an invoice (createMysInvoiceFromDebts) - that
      // invoice is what represents this money owed now, not this row too.
      .is("mys_invoice_id", null)
      .order("expense_date", { ascending: false }),
    supabase
      .from("mys_ad_hoc_charges")
      .select("*")
      .is("invoice_id", null)
      .order("charge_date", { ascending: false }),
    supabase
      .from("mys_invoices")
      .select(
        "id, boat_id, invoice_number, client_name, client_email, client_company_details, description, status, amount, vat_amount, issued_date, due_date"
      )
      // Stays an open debt through the whole not-yet-fully-paid lifecycle -
      // a 'draft' invoice hasn't lost the money it's for just because it
      // hasn't been sent yet, and a 'sent' one drops off the list below
      // only once addMysInvoicePayment actually flips it to 'paid'.
      .in("status", ["draft", "sent"])
      .order("issued_date", { ascending: false }),
    supabase.from("mys_clients").select("id, name, email").order("name"),
    supabase
      .from("mys_supplier_commissions")
      .select(
        "id, supplier_name, invoice_date, invoice_amount, commission_percent, commission_amount, vat_percent, total_amount, notes, commission_invoice_path"
      )
      .eq("status", "unpaid")
      .order("invoice_date", { ascending: false }),
  ]);
  const clientEmailByName = Object.fromEntries((clients ?? []).flatMap((c) => (c.email ? [[c.name, c.email]] : [])));

  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));

  // Partial-payment history for the "charge"/"ad_hoc" debt kinds (see
  // addMysDebtSettlement, src/lib/actions/mys.ts) - each row's own amount
  // stays its original full cost; what actually still shows as owed on
  // /mys/debts is that minus whatever's already been paid against it.
  const chargeIds = (charges ?? []).map((c) => c.id);
  const adHocIds = (adHocCharges ?? []).map((c) => c.id);
  const [{ data: chargeSettlements }, { data: adHocSettlements }] = await Promise.all([
    chargeIds.length > 0
      ? supabase.from("mys_debt_settlements").select("*").in("expense_id", chargeIds).order("paid_date")
      : Promise.resolve({ data: [] as MysDebtSettlement[] }),
    adHocIds.length > 0
      ? supabase.from("mys_debt_settlements").select("*").in("ad_hoc_charge_id", adHocIds).order("paid_date")
      : Promise.resolve({ data: [] as MysDebtSettlement[] }),
  ]);
  const settlementsByExpenseId = new Map<string, MysDebtSettlement[]>();
  for (const s of chargeSettlements ?? []) {
    const arr = settlementsByExpenseId.get(s.expense_id!);
    if (arr) arr.push(s);
    else settlementsByExpenseId.set(s.expense_id!, [s]);
  }
  const settlementsByAdHocId = new Map<string, MysDebtSettlement[]>();
  for (const s of adHocSettlements ?? []) {
    const arr = settlementsByAdHocId.get(s.ad_hoc_charge_id!);
    if (arr) arr.push(s);
    else settlementsByAdHocId.set(s.ad_hoc_charge_id!, [s]);
  }

  // SAMARA's management-paid charges aren't actually MYS debts (per her
  // explicit call) - excluded outright, open or settled, rather than only
  // suppressing its 233 already-settled legacy rows. Filtered here in JS
  // (not the SQL query above) since it's simplest to key off the boat name
  // already resolved into boatNameById below.
  const samaraBoatId = (boats ?? []).find((b) => b.name === "SAMARA")?.id;
  const chargesExcludingSamara = (charges ?? []).filter((c) => c.boat_id !== samaraBoatId);

  // A row settled before the mys_debt_settlements history table existed
  // (see 0093_mys_debt_settlements.sql) only ever recorded that fact via
  // mys_charge_settled_at/status='paid' directly - it has no settlement rows
  // to sum. Treat that legacy shape as fully paid too (not $0 paid so far),
  // or every such old, already-closed charge would wrongly compute as a
  // brand-new full-amount debt below.
  //
  // Fully-settled rows stay in the list (sunk to the bottom with a paid
  // indicator, see MysDebtsManager's isSettled sort) rather than being
  // excluded here - she wants to see what's actually been paid, not just
  // what's still open.
  const chargesWithBoat = chargesExcludingSamara.map((c) => {
    const settlements = settlementsByExpenseId.get(c.id) ?? [];
    const paidSoFar = settlements.length === 0 && c.mys_charge_settled_at ? c.amount : round2(settlements.reduce((s, p) => s + p.amount, 0));
    return { ...c, boatName: boatNameById.get(c.boat_id) ?? "", remainingAmount: round2(c.amount - paidSoFar), paidSoFar, settlements };
  });
  const adHocChargesWithBalance = (adHocCharges ?? []).map((c) => {
    const settlements = settlementsByAdHocId.get(c.id) ?? [];
    const paidSoFar = settlements.length === 0 && c.status === "paid" ? c.amount : round2(settlements.reduce((s, p) => s + p.amount, 0));
    return { ...c, remainingAmount: round2(c.amount - paidSoFar), paidSoFar, settlements };
  });

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  // Edit/mark-paid/void of an invoice-kind debt row (MysDebtsManager) needs
  // each invoice's own lines (for the invoice-style line editor) and full
  // payment records (for the payment-history read-out and the running
  // paid-so-far sum below) - the same two queries the Invoices page runs.
  let invoiceLines: MysInvoiceLine[] = [];
  let invoicePayments: MysInvoicePayment[] = [];
  if (invoiceIds.length > 0) {
    const [{ data: linesData }, { data: paymentsData }] = await Promise.all([
      supabase.from("mys_invoice_lines").select("*").in("invoice_id", invoiceIds).order("created_at"),
      supabase.from("mys_invoice_payments").select("*").in("invoice_id", invoiceIds).order("paid_date"),
    ]);
    invoiceLines = linesData ?? [];
    invoicePayments = paymentsData ?? [];
  }
  const linesByInvoiceId = new Map<string, MysInvoiceLine[]>();
  for (const l of invoiceLines) {
    const arr = linesByInvoiceId.get(l.invoice_id);
    if (arr) arr.push(l);
    else linesByInvoiceId.set(l.invoice_id, [l]);
  }
  const paymentsByInvoiceId = new Map<string, MysInvoicePayment[]>();
  for (const p of invoicePayments) {
    const arr = paymentsByInvoiceId.get(p.invoice_id);
    if (arr) arr.push(p);
    else paymentsByInvoiceId.set(p.invoice_id, [p]);
  }
  const paidByInvoiceId = new Map<string, number>();
  for (const p of invoicePayments) paidByInvoiceId.set(p.invoice_id, (paidByInvoiceId.get(p.invoice_id) ?? 0) + p.amount);

  // The debt this invoice still represents is what's actually left unpaid,
  // not its original total - a partial payment (addMysInvoicePayment)
  // shrinks what shows here without needing its own status transition.
  const invoicesWithBoat = (invoices ?? [])
    .map((i) => ({
      ...i,
      boatName: i.boat_id ? (boatNameById.get(i.boat_id) ?? "") : null,
      remainingAmount: Math.max(0, i.amount + i.vat_amount - (paidByInvoiceId.get(i.id) ?? 0)),
      lines: linesByInvoiceId.get(i.id) ?? [],
      payments: paymentsByInvoiceId.get(i.id) ?? [],
    }))
    .filter((i) => i.remainingAmount > 0);
  // Fleet boats and ad-hoc mys_clients entries share one alphabetical
  // picker list, deduped against any boat name so the same word never
  // appears twice in the dropdown.
  const boatNames = new Set((boats ?? []).map((b) => b.name));
  const clientNames = [...(boats ?? []).map((b) => b.name), ...(clients ?? []).map((c) => c.name).filter((n) => !boatNames.has(n))].sort((a, b) =>
    a.localeCompare(b)
  );

  const commissionIds = (commissions ?? []).map((c) => c.id);
  const { data: commissionAttachments } =
    commissionIds.length > 0
      ? await supabase.from("mys_supplier_commission_attachments").select("id, commission_id, file_path").in("commission_id", commissionIds)
      : { data: [] as { id: string; commission_id: string; file_path: string }[] };
  const commissionSignedUrlByPath = await getCachedSignedUrls("receipts", [
    ...(commissionAttachments ?? []).map((a) => a.file_path),
    ...(commissions ?? []).flatMap((c) => (c.commission_invoice_path ? [c.commission_invoice_path] : [])),
  ]);
  const attachmentsByCommissionId = new Map<string, { id: string; url: string }[]>();
  for (const a of commissionAttachments ?? []) {
    const url = commissionSignedUrlByPath.get(a.file_path);
    if (!url) continue;
    const arr = attachmentsByCommissionId.get(a.commission_id);
    if (arr) arr.push({ id: a.id, url });
    else attachmentsByCommissionId.set(a.commission_id, [{ id: a.id, url }]);
  }
  const commissionsWithAttachments = (commissions ?? []).map((c) => ({
    ...c,
    attachments: attachmentsByCommissionId.get(c.id) ?? [],
    commission_invoice_url: (c.commission_invoice_path && commissionSignedUrlByPath.get(c.commission_invoice_path)) ?? null,
  }));

  return (
    <div className="flex flex-col gap-3">
      <MysBackLink locale={locale} />
      <MysDebtsManager
        boats={boats ?? []}
        charges={chargesWithBoat}
        adHocCharges={adHocChargesWithBalance}
        commissions={commissionsWithAttachments}
        invoices={invoicesWithBoat}
        clientNames={clientNames}
        clientEmailByName={clientEmailByName}
        locale={locale}
      />
    </div>
  );
}
