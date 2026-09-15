import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { getOpenMysDebtsForIncomeMatch } from "@/lib/actions/mys";
import { MysIncomeManager } from "@/components/mys-income-manager";
import { MysBackLink } from "@/components/mys-back-link";
import { getTranslator } from "@/lib/i18n/locale";

export default async function MysIncomePage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();
  const [{ data: income }, { data: boats }, { data: clients }, openDebts] = await Promise.all([
    supabase.from("mys_income").select("*").order("income_date", { ascending: false }),
    supabase.from("boats").select("id, name").order("name"),
    supabase.from("mys_clients").select("id, name").order("name"),
    getOpenMysDebtsForIncomeMatch(),
  ]);

  // Same combined list as the debts page's client picker: boats and ad-hoc
  // mys_clients entries together, alphabetical, deduped against any boat name.
  const boatNames = new Set((boats ?? []).map((b) => b.name));
  const clientNames = [...(boats ?? []).map((b) => b.name), ...(clients ?? []).map((c) => c.name).filter((n) => !boatNames.has(n))].sort((a, b) =>
    a.localeCompare(b)
  );

  const invoicePaths = [...new Set((income ?? []).flatMap((i) => (i.invoice_path ? [i.invoice_path] : [])))];
  const signedUrlByPath = await getCachedSignedUrls("receipts", invoicePaths);

  // An income row auto-recorded from a paid invoice (addMysInvoicePayment)
  // stores a snapshot of that invoice's own description - for an invoice
  // combined from several debts, that's the full joined line-item text,
  // which reads as clutter in this list. Show the linked invoice's number
  // instead for any such row - a clean, stable identifier instead of a
  // wall of text she can already see in full on the invoice itself.
  const linkedInvoiceIds = [...new Set((income ?? []).flatMap((i) => (i.mys_invoice_id ? [i.mys_invoice_id] : [])))];
  const { data: linkedInvoices } =
    linkedInvoiceIds.length > 0
      ? await supabase.from("mys_invoices").select("id, invoice_number").in("id", linkedInvoiceIds)
      : { data: [] as { id: string; invoice_number: string }[] };
  const invoiceNumberById = new Map((linkedInvoices ?? []).map((inv) => [inv.id, inv.invoice_number]));

  const withUrls = (income ?? []).map((i) => ({
    ...i,
    invoiceUrl: (i.invoice_path && signedUrlByPath.get(i.invoice_path)) ?? null,
    displayDescription: (i.mys_invoice_id && invoiceNumberById.get(i.mys_invoice_id)) || i.description,
  }));

  return (
    <div className="flex flex-col gap-3">
      <MysBackLink locale={locale} />
      <MysIncomeManager income={withUrls} clientNames={clientNames} openDebts={openDebts} locale={locale} />
    </div>
  );
}
