import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MysClientsManager } from "@/components/mys-clients-manager";
import { getTranslator } from "@/lib/i18n/locale";

export default async function MysClientsPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();

  const { data: clients } = await supabase.from("mys_clients").select("*").order("name");

  return <MysClientsManager clients={clients ?? []} locale={locale} />;
}
