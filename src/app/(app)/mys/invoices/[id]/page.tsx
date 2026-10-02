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

      <div
        dir="ltr"
        className="mx-auto w-full max-w-[780px] bg-white p-8 text-sm text-fleet-navy sm:p-12 print:max-w-none print:p-12"
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 print:break-inside-avoid">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={companyLogoUrl} alt="" className="h-12 w-12 shrink-0 object-contain" />
            <div className="leading-snug">
              <div className="font-semibold">{MYS_COMPANY_INFO.name}</div>
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
          <div className="shrink-0 text-end leading-snug">
            <div className="text-base font-semibold">Invoice #{invoice.invoice_number}</div>
            <div className="mt-1 text-xs text-fleet-ink">Issue Date: {formatDateDisplay(invoice.issued_date)}</div>
            {invoice.due_date && <div className="text-xs text-fleet-ink">Due Date: {formatDateDisplay(invoice.due_date)}</div>}
          </div>
        </div>

        {/* Customer */}
        <div className="mt-8 border-t border-[#e5e7eb] pt-4 print:break-inside-avoid">
          <div className="text-2xs font-semibold tracking-wide text-fleet-ink uppercase">Customer Info</div>
          <div className="mt-1 font-semibold">{invoice.client_name}</div>
          {invoice.client_email && <div className="text-xs text-fleet-ink">{invoice.client_email}</div>}
          {invoice.client_company_details && (
            <div className="whitespace-pre-wrap text-xs text-fleet-ink">{invoice.client_company_details}</div>
          )}
        </div>

        {/* Line items */}
        <table className="mt-8 w-full border-collapse text-xs">
          <colgroup>
            <col />
            <col className="w-20" />
            <col className="w-24" />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="border-b border-[#e5e7eb]">
              <th className="py-2 text-start font-semibold text-fleet-ink">Product or Service</th>
              <th className="px-2 py-2 text-end font-semibold text-fleet-ink">Quantity</th>
              <th className="px-2 py-2 text-end font-semibold text-fleet-ink">Price</th>
              <th className="py-2 text-end font-semibold text-fleet-ink">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-[#e5e7eb]">
                <td className="py-2.5 break-words">{item.description}</td>
                <td className="px-2 py-2.5 text-end tabular-nums">1</td>
                <td className="px-2 py-2.5 text-end tabular-nums">{money(item.amount)}</td>
                <td className="py-2.5 text-end tabular-nums">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary - every row shares the same width/alignment so labels and
            amounts line up on a single vertical grid; weight/size are the
            only things that change row to row. */}
        <div className="mt-8 flex justify-end print:break-inside-avoid">
          <div className="w-full max-w-[260px]">
            <div className="flex items-baseline justify-between py-1">
              <span>Subtotal</span>
              <span className="tabular-nums">{money(subtotal)}</span>
            </div>
            <div className="flex items-baseline justify-between py-1 text-fleet-ink">
              <span>Taxes</span>
              <span className="tabular-nums">{money(taxes)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between border-t border-[#e5e7eb] py-2 font-bold">
              <span>Invoice Total</span>
              <span className="tabular-nums">{money(total)}</span>
            </div>
            <div className="flex items-baseline justify-between py-1 text-fleet-ink">
              <span>Amount Paid</span>
              <span className="tabular-nums">{money(amountPaid)}</span>
            </div>
            <div className="flex items-baseline justify-between py-1 text-base font-bold">
              <span>Balance Due</span>
              <span className="tabular-nums">{money(balanceDue)}</span>
            </div>
          </div>
        </div>

        {/* Bank details */}
        <div className="mt-8 border-t border-[#e5e7eb] pt-4 print:break-inside-avoid">
          <div className="text-2xs font-semibold tracking-wide text-fleet-ink uppercase">Bank Details</div>
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <span className="text-fleet-ink">Bank</span>
            <span className="font-medium">{MYS_BANK_DETAILS.bankName}</span>
            <span className="text-fleet-ink">IBAN (EUR)</span>
            <span className="font-mono tracking-wide">{MYS_BANK_DETAILS.ibanEur}</span>
            <span className="text-fleet-ink">IBAN (USD)</span>
            <span className="font-mono tracking-wide">{MYS_BANK_DETAILS.ibanUsd}</span>
            <span className="text-fleet-ink">SWIFT / BIC</span>
            <span className="font-mono tracking-wide">{MYS_BANK_DETAILS.swift}</span>
            <span className="text-fleet-ink">Address</span>
            <span className="font-medium">
              {MYS_BANK_DETAILS.address}, {MYS_BANK_DETAILS.country}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
