import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MysInvoicesManager } from "@/components/mys-invoices-manager";
import { getTranslator } from "@/lib/i18n/locale";
import type { MysInvoiceLine } from "@/lib/types/database";

export default async function MysInvoicesPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();

  const [{ data: invoices }, { data: boats }] = await Promise.all([
    supabase.from("mys_invoices").select("*").order("created_at", { ascending: false }),
    supabase.from("boats").select("id, name").order("name"),
  ]);

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  let lines: MysInvoiceLine[] = [];
  if (invoiceIds.length > 0) {
    const { data } = await supabase.from("mys_invoice_lines").select("*").in("invoice_id", invoiceIds).order("created_at");
    lines = data ?? [];
  }
  const linesByInvoiceId = new Map<string, MysInvoiceLine[]>();
  for (const l of lines) {
    const arr = linesByInvoiceId.get(l.invoice_id);
    if (arr) arr.push(l);
    else linesByInvoiceId.set(l.invoice_id, [l]);
  }
  const invoicesWithLines = (invoices ?? []).map((i) => ({ ...i, lines: linesByInvoiceId.get(i.id) ?? [] }));

  return <MysInvoicesManager invoices={invoicesWithLines} boats={boats ?? []} locale={locale} />;
}
