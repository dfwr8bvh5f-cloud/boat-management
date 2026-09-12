import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MysDebtsManager } from "@/components/mys-debts-manager";
import { getTranslator } from "@/lib/i18n/locale";
import type { MysInvoiceLine, MysInvoicePayment } from "@/lib/types/database";

export default async function MysDebtsPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();

  const [{ data: boats }, { data: charges }, { data: adHocCharges }, { data: invoices }, { data: clients }] = await Promise.all([
    supabase.from("boats").select("id, name").order("name"),
    supabase
      .from("expenses")
      .select("id, boat_id, description, amount, expense_date")
      .eq("paid_by", "management")
      .eq("is_payment_plan", false)
      .eq("status", "approved")
      .is("mys_charge_settled_at", null)
      // Already combined into an invoice (createMysInvoiceFromDebts) - that
      // invoice is what represents this money owed now, not this row too.
      .is("mys_invoice_id", null)
      .order("expense_date", { ascending: false }),
    supabase
      .from("mys_ad_hoc_charges")
      .select("*")
      .eq("status", "unpaid")
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
    supabase.from("mys_clients").select("id, name").order("name"),
  ]);

  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));
  const chargesWithBoat = (charges ?? []).map((c) => ({ ...c, boatName: boatNameById.get(c.boat_id) ?? "" }));

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
  // The boats' own names always lead the client picker, since they're the
  // fleet's own recurring clients - ad-hoc mys_clients entries (one-off
  // customers) follow, deduped against any boat name so the same word never
  // appears twice in the dropdown.
  const boatNames = new Set((boats ?? []).map((b) => b.name));
  const clientNames = [...(boats ?? []).map((b) => b.name), ...(clients ?? []).map((c) => c.name).filter((n) => !boatNames.has(n))];

  return (
    <MysDebtsManager
      boats={boats ?? []}
      charges={chargesWithBoat}
      adHocCharges={adHocCharges ?? []}
      invoices={invoicesWithBoat}
      clientNames={clientNames}
      locale={locale}
    />
  );
}
