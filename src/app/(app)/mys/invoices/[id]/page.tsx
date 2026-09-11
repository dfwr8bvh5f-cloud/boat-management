import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrl } from "@/lib/storage-cache";
import { formatDateDisplay } from "@/lib/date-format";
import { round2 } from "@/lib/money";
import { PrintButton } from "@/components/print-button";
import { getTranslator } from "@/lib/i18n/locale";
import { MYS_COMPANY_INFO, MYS_BANK_DETAILS } from "@/lib/mys-company-info";

// The generated invoice document itself is a fixed-language business
// document (English, LTR) regardless of the app's own locale - same as the
// real invoices she already sends clients (see the reference PDF this page
// was built from), not app UI chrome that should follow the viewer's
// language. Only the surrounding back-link/print button (t() below) follow
// the app's locale, same split the manifest page (a different printable
// document) already makes.
export default async function MysInvoiceDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");
  const { t, locale } = await getTranslator();

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: invoice }, { data: lines }, { data: payments }, { data: settings }] = await Promise.all([
    supabase.from("mys_invoices").select("*").eq("id", id).single(),
    supabase.from("mys_invoice_lines").select("*").eq("invoice_id", id).order("created_at"),
    supabase.from("mys_invoice_payments").select("*").eq("invoice_id", id).order("paid_date"),
    supabase.from("app_settings").select("company_logo_path").eq("id", true).single(),
  ]);
  if (!invoice) notFound();

  const companyLogoUrl = settings?.company_logo_path
    ? ((await getCachedSignedUrl("company-assets", settings.company_logo_path)) ?? "/mys-logo.png")
    : "/mys-logo.png";

  // A plain manually-typed invoice has no lines at all - it's shown as a
  // single billed item using the invoice's own description/amount, so the
  // document always has at least one row instead of an empty table.
  const items =
    (lines ?? []).length > 0
      ? (lines ?? []).map((l) => ({ description: l.description, amount: l.amount }))
      : [{ description: invoice.description, amount: invoice.amount }];

  const subtotal = round2(invoice.amount);
  const taxes = round2(invoice.vat_amount);
  const total = round2(subtotal + taxes);
  const amountPaid = round2((payments ?? []).reduce((s, p) => s + p.amount, 0));
  const balanceDue = round2(Math.max(0, total - amountPaid));

  const money = (n: number) => `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/mys/invoices" className="text-sm font-medium text-fleet-teal hover:underline">
          ← {t("back_to_invoices")}
        </Link>
        <PrintButton locale={locale} />
      </div>

      <div dir="ltr" className="rounded-xl border border-fleet-border bg-white p-6 text-sm text-fleet-navy sm:p-10 print:border-0 print:p-0">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={companyLogoUrl} alt="" className="h-14 w-14 shrink-0 object-contain" />
            <div>
              <div className="font-bold">{MYS_COMPANY_INFO.name}</div>
              <div className="text-xs text-fleet-ink">{MYS_COMPANY_INFO.tagline}</div>
              {MYS_COMPANY_INFO.addressLines.map((line) => (
                <div key={line} className="text-xs text-fleet-ink">
                  {line}
                </div>
              ))}
              <div className="text-xs text-fleet-ink">{MYS_COMPANY_INFO.phone}</div>
              <div className="text-xs text-fleet-ink">{MYS_COMPANY_INFO.email}</div>
              <div className="text-xs text-fleet-ink">VAT {MYS_COMPANY_INFO.vat}</div>
              <div className="text-xs text-fleet-ink">{MYS_COMPANY_INFO.taxOffice}</div>
            </div>
          </div>
          <div className="text-end">
            <div className="text-lg font-bold">Invoice #{invoice.invoice_number}</div>
            <div className="text-xs text-fleet-ink">Issue Date: {formatDateDisplay(invoice.issued_date)}</div>
            {invoice.due_date && <div className="text-xs text-fleet-ink">Due Date: {formatDateDisplay(invoice.due_date)}</div>}
          </div>
        </div>

        <div className="mb-6 border-t border-fleet-border pt-3">
          <div className="text-2xs font-bold uppercase tracking-wide text-fleet-ink">Customer Info</div>
          <div className="font-bold">{invoice.client_name}</div>
          {invoice.client_email && <div className="text-xs text-fleet-ink">{invoice.client_email}</div>}
          {invoice.client_company_details && (
            <div className="whitespace-pre-wrap text-xs text-fleet-ink">{invoice.client_company_details}</div>
          )}
        </div>

        <table className="mb-6 w-full border-collapse text-xs">
          <thead>
            <tr className="bg-fleet-paper">
              <th className="border-b border-fleet-border px-2 py-2 text-start">Product or Service</th>
              <th className="border-b border-fleet-border px-2 py-2 text-end">Quantity</th>
              <th className="border-b border-fleet-border px-2 py-2 text-end">Price</th>
              <th className="border-b border-fleet-border px-2 py-2 text-end">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td className="border-b border-dotted border-fleet-border px-2 py-2">{item.description}</td>
                <td className="border-b border-dotted border-fleet-border px-2 py-2 text-end">1</td>
                <td className="border-b border-dotted border-fleet-border px-2 py-2 text-end">{money(item.amount)}</td>
                <td className="border-b border-dotted border-fleet-border px-2 py-2 text-end">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mb-6 flex justify-end">
          <div className="flex w-full max-w-xs flex-col gap-1.5">
            <div className="flex justify-between font-bold">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="flex justify-between text-fleet-ink">
              <span>Taxes</span>
              <span>{money(taxes)}</span>
            </div>
            <div className="flex justify-between border-t border-fleet-border pt-1.5 font-bold">
              <span>Invoice Total</span>
              <span>{money(total)}</span>
            </div>
            <div className="flex justify-between text-fleet-ink">
              <span>Amount Paid</span>
              <span>{money(amountPaid)}</span>
            </div>
            <div className="flex justify-between rounded-lg bg-fleet-paper px-3 py-2 text-base font-bold">
              <span>Balance Due</span>
              <span>{money(balanceDue)}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-fleet-border pt-3">
          <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-fleet-ink">Bank Details</div>
          <div className="font-bold">{MYS_BANK_DETAILS.bankName}</div>
          <div className="text-xs text-fleet-ink">IBAN EUR: {MYS_BANK_DETAILS.ibanEur}</div>
          <div className="text-xs text-fleet-ink">IBAN USD: {MYS_BANK_DETAILS.ibanUsd}</div>
          <div className="text-xs text-fleet-ink">SWIFT Code / BIC: {MYS_BANK_DETAILS.swift}</div>
          <div className="text-xs text-fleet-ink">
            {MYS_BANK_DETAILS.address}, {MYS_BANK_DETAILS.country}
          </div>
        </div>
      </div>
    </div>
  );
}
