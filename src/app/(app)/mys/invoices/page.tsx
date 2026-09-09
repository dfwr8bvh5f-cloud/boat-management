import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MysInvoicesManager } from "@/components/mys-invoices-manager";
import { getTranslator } from "@/lib/i18n/locale";

export default async function MysInvoicesPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();

  const [{ data: invoices }, { data: boats }] = await Promise.all([
    supabase.from("mys_invoices").select("*").order("created_at", { ascending: false }),
    supabase.from("boats").select("id, name").order("name"),
  ]);

  return <MysInvoicesManager invoices={invoices ?? []} boats={boats ?? []} locale={locale} />;
}
