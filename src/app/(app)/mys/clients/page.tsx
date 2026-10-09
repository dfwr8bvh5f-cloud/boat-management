import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { MysClientsManager } from "@/components/mys-clients-manager";
import { MysBackLink } from "@/components/mys-back-link";
import { getTranslator } from "@/lib/i18n/locale";
import type { MysClient } from "@/lib/types/database";

export default async function MysClientsPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();

  const clients = await fetchAllRows<MysClient>((from, to) => supabase.from("mys_clients").select("*").order("name").range(from, to));

  return (
    <div className="flex flex-col gap-3">
      <MysBackLink locale={locale} />
      <MysClientsManager clients={clients} locale={locale} />
    </div>
  );
}
