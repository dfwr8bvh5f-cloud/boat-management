import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { fetchRowsForIds } from "@/lib/supabase/fetch-all";
import { MysInvoicesManager } from "@/components/mys-invoices-manager";
import { MysBackLink } from "@/components/mys-back-link";
import { getTranslator } from "@/lib/i18n/locale";
import type { MysInvoiceLine, MysInvoicePayment } from "@/lib/types/database";

export default async function MysInvoicesPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();

  const [{ data: invoices }, { data: boats }, { data: clients }] = await Promise.all([
    supabase.from("mys_invoices").select("*").order("created_at", { ascending: false }),
    supabase.from("boats").select("id, name").order("name"),
    supabase.from("mys_clients").select("name, email").order("name"),
  ]);
  const clientEmailByName = Object.fromEntries((clients ?? []).flatMap((c) => (c.email ? [[c.name, c.email]] : [])));
  // Same combined list as the debts/income/expenses pages' client picker:
  // boats and ad-hoc mys_clients entries together, alphabetical, deduped
  // against any boat name.
  const boatNameSet = new Set((boats ?? []).map((b) => b.name));
  const clientNames = [...(boats ?? []).map((b) => b.name), ...(clients ?? []).map((c) => c.name).filter((n) => !boatNameSet.has(n))].sort(
    (a, b) => a.localeCompare(b)
  );

  // Chunked (see fetchRowsForIds) - same risk confirmed live on the
  // expenses pages: enough invoices in one .in(invoiceIds) call can exceed
  // a proxy's URL-length limit and silently fail the whole request. Here
  // that would be worse than a missing icon - payments coming back empty
  // would show a paid invoice's full amount as still due.
  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const [lines, payments] = await Promise.all([
    fetchRowsForIds<MysInvoiceLine>(invoiceIds, (chunk) =>
      supabase.from("mys_invoice_lines").select("*").in("invoice_id", chunk).order("created_at")
    ),
    fetchRowsForIds<MysInvoicePayment>(invoiceIds, (chunk) =>
      supabase.from("mys_invoice_payments").select("*").in("invoice_id", chunk).order("paid_date")
    ),
  ]);
  const linesByInvoiceId = new Map<string, MysInvoiceLine[]>();
  for (const l of lines) {
    const arr = linesByInvoiceId.get(l.invoice_id);
    if (arr) arr.push(l);
    else linesByInvoiceId.set(l.invoice_id, [l]);
  }
  const paymentsByInvoiceId = new Map<string, MysInvoicePayment[]>();
  for (const p of payments) {
    const arr = paymentsByInvoiceId.get(p.invoice_id);
    if (arr) arr.push(p);
    else paymentsByInvoiceId.set(p.invoice_id, [p]);
  }

  const invoicePaths = [...new Set((invoices ?? []).flatMap((i) => (i.invoice_path ? [i.invoice_path] : [])))];
  const signedUrlByPath = await getCachedSignedUrls("receipts", invoicePaths);

  const invoicesWithExtras = (invoices ?? []).map((i) => ({
    ...i,
    lines: linesByInvoiceId.get(i.id) ?? [],
    payments: paymentsByInvoiceId.get(i.id) ?? [],
    invoiceUrl: (i.invoice_path && signedUrlByPath.get(i.invoice_path)) ?? null,
  }));

  return (
    <div className="flex flex-col gap-3">
      <MysBackLink locale={locale} />
      <MysInvoicesManager invoices={invoicesWithExtras} clientNames={clientNames} clientEmailByName={clientEmailByName} locale={locale} />
    </div>
  );
}
