import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { MysDebtsManager } from "@/components/mys-debts-manager";
import { MysBackLink } from "@/components/mys-back-link";
import { getTranslator } from "@/lib/i18n/locale";
import { round2 } from "@/lib/money";
import type { MysInvoiceLine, MysInvoicePayment, MysDebtSettlement, MysCommissionPayment } from "@/lib/types/database";

export default async function MysDebtsPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { t, locale } = await getTranslator();
  const supabase = await createClient();

  const [{ data: boats }, { data: charges }, { data: adHocCharges }, { data: invoices }, { data: clients }, { data: commissions }] =
    await Promise.all([
    supabase.from("boats").select("id, name, boat_type").order("name"),
    supabase
      .from("expenses")
      .select("id, boat_id, description, amount, expense_date, receipt_path, photo_path, mys_charge_settled_at")
      .eq("paid_by", "management")
      // Only rows explicitly marked as a real client debt - most
      // paid_by='management' rows are just a routine cost MYS happened to
      // cover, never meant to be billed back (see Expense.bill_to_mys /
      // 0099_expense_bill_to_mys.sql).
      .eq("bill_to_mys", true)
      .eq("is_payment_plan", false)
      .eq("status", "approved")
      // Fetched here regardless of settled status (a partially-paid row still
      // needs to show up with its remaining balance) - fully-settled ones are
      // filtered out below, once remainingAmount is known, instead of at the
      // SQL level. SAMARA's rows are excluded separately below regardless of
      // settled status. Already combined into an invoice
      // (createMysInvoiceFromDebts) - that invoice is what represents this
      // money owed now, not this row too.
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
        "id, supplier_name, invoice_date, invoice_amount, commission_percent, commission_amount, vat_percent, total_amount, notes, commission_invoice_path, status"
      )
      // A partial payment (addMysSupplierCommissionPayment) keeps this at
      // 'unpaid' with a shrunk remaining balance below - only once fully
      // paid does status flip to 'paid', at which point it drops off this
      // list entirely (per her call), same as a fully-paid invoice already
      // does below.
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

  // SAMARA's legacy management-paid charges (242 of them, all dated before
  // 2026-09-15 - see PR #96) turned out not to be real MYS debts at all and
  // were excluded outright. That exclusion was boat-wide and open-ended
  // though, so it also hid genuine new SAMARA debts created after that fix
  // shipped. Narrowed to a date cutoff instead (confirmed with her): only
  // SAMARA charges dated before 2026-09-15 are excluded now - anything from
  // that date on is a real debt and shows normally, same as every other boat.
  const SAMARA_DEBT_CUTOFF_DATE = "2026-09-15";
  const samaraBoatId = (boats ?? []).find((b) => b.name === "SAMARA")?.id;
  const chargesExcludingSamara = (charges ?? []).filter(
    (c) => c.boat_id !== samaraBoatId || (c.expense_date !== null && c.expense_date >= SAMARA_DEBT_CUTOFF_DATE)
  );

  // A row settled before the mys_debt_settlements history table existed
  // (see 0093_mys_debt_settlements.sql) only ever recorded that fact via
  // mys_charge_settled_at/status='paid' directly - it has no settlement rows
  // to sum. Treat that legacy shape as fully paid too (not $0 paid so far),
  // or every such old, already-closed charge would wrongly compute as a
  // brand-new full-amount debt below.
  //
  // A fully-settled row drops off this list entirely (per her call) - what
  // was paid already shows on /mys/income instead (each settlement
  // auto-records its own income row, see createLinkedIncomeForSettlement),
  // and what's still unpaid keeps showing here with its remaining balance,
  // same as a partially-paid invoice already does below.
  const chargesWithBoat = chargesExcludingSamara
    .map((c) => {
      const settlements = settlementsByExpenseId.get(c.id) ?? [];
      const paidSoFar = settlements.length === 0 && c.mys_charge_settled_at ? c.amount : round2(settlements.reduce((s, p) => s + p.amount, 0));
      // boat_id can be null here even though this column is normally always
      // set when an expense is created - it happens only via the boats
      // table's own on-delete-set-null (0001_init.sql): the boat this
      // expense belonged to was deleted while the expense itself, still
      // billable to MYS and still unpaid, survived. Left silently blank
      // before, this tile/row was literally unlabeled and unfindable -
      // confirmed live via screenshot. Labeled instead of hidden, so she
      // can actually locate and resolve it.
      const boatName = c.boat_id ? (boatNameById.get(c.boat_id) ?? t("mys_deleted_boat_label")) : t("mys_deleted_boat_label");
      return { ...c, boatName, remainingAmount: round2(c.amount - paidSoFar), paidSoFar, settlements };
    })
    .filter((c) => c.remainingAmount > 0);
  // The invoice(s) she issued the client for each ad-hoc charge - same
  // one-to-many attachment pattern as supplier commissions below.
  const { data: adHocAttachments } =
    adHocIds.length > 0
      ? await supabase.from("mys_ad_hoc_charge_attachments").select("id, ad_hoc_charge_id, file_path").in("ad_hoc_charge_id", adHocIds)
      : { data: [] as { id: string; ad_hoc_charge_id: string; file_path: string }[] };
  const adHocSignedUrlByPath = await getCachedSignedUrls("receipts", (adHocAttachments ?? []).map((a) => a.file_path));
  const attachmentsByAdHocChargeId = new Map<string, { id: string; url: string; path: string }[]>();
  for (const a of adHocAttachments ?? []) {
    const url = adHocSignedUrlByPath.get(a.file_path);
    if (!url) continue;
    const entry = { id: a.id, url, path: a.file_path };
    const arr = attachmentsByAdHocChargeId.get(a.ad_hoc_charge_id);
    if (arr) arr.push(entry);
    else attachmentsByAdHocChargeId.set(a.ad_hoc_charge_id, [entry]);
  }

  const adHocChargesWithBalance = (adHocCharges ?? [])
    .map((c) => {
      const settlements = settlementsByAdHocId.get(c.id) ?? [];
      const paidSoFar = settlements.length === 0 && c.status === "paid" ? c.amount : round2(settlements.reduce((s, p) => s + p.amount, 0));
      return {
        ...c,
        remainingAmount: round2(c.amount - paidSoFar),
        paidSoFar,
        settlements,
        attachments: attachmentsByAdHocChargeId.get(c.id) ?? [],
      };
    })
    .filter((c) => c.remainingAmount > 0);

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
      ? await supabase
          .from("mys_supplier_commission_attachments")
          .select("id, commission_id, file_path, kind")
          .in("commission_id", commissionIds)
      : { data: [] as { id: string; commission_id: string; file_path: string; kind: "supplier" | "issued" }[] };
  const commissionSignedUrlByPath = await getCachedSignedUrls("receipts", (commissionAttachments ?? []).map((a) => a.file_path));
  // Split by kind the same way /mys/commissions does (see its own page.tsx)
  // - the supplier's own invoice(s) vs. the one(s) she issues to them.
  const attachmentsByCommissionId = new Map<string, { id: string; url: string }[]>();
  const issuedInvoicesByCommissionId = new Map<string, { id: string; url: string }[]>();
  for (const a of commissionAttachments ?? []) {
    const url = commissionSignedUrlByPath.get(a.file_path);
    if (!url) continue;
    const map = a.kind === "issued" ? issuedInvoicesByCommissionId : attachmentsByCommissionId;
    const arr = map.get(a.commission_id);
    if (arr) arr.push({ id: a.id, url });
    else map.set(a.commission_id, [{ id: a.id, url }]);
  }
  // Partial-payment history for commissions (see
  // addMysSupplierCommissionPayment, src/lib/actions/mys-commissions.ts) -
  // same shape/role as the charge/ad_hoc settlements above: each row's own
  // total_amount stays fixed, what actually still shows as owed here is
  // that minus whatever's already been paid against it.
  const { data: commissionPayments } =
    commissionIds.length > 0
      ? await supabase.from("mys_commission_payments").select("*").in("commission_id", commissionIds).order("paid_date")
      : { data: [] as MysCommissionPayment[] };
  const paymentsByCommissionId = new Map<string, MysCommissionPayment[]>();
  for (const p of commissionPayments ?? []) {
    const arr = paymentsByCommissionId.get(p.commission_id);
    if (arr) arr.push(p);
    else paymentsByCommissionId.set(p.commission_id, [p]);
  }

  const commissionsWithAttachments = (commissions ?? []).map((c) => {
    const payments = paymentsByCommissionId.get(c.id) ?? [];
    const paidSoFar = round2(payments.reduce((s, p) => s + p.amount, 0));
    return {
      ...c,
      attachments: attachmentsByCommissionId.get(c.id) ?? [],
      issuedInvoices: issuedInvoicesByCommissionId.get(c.id) ?? [],
      payments,
      paidSoFar,
      remainingAmount: round2(c.total_amount - paidSoFar),
    };
  });

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
