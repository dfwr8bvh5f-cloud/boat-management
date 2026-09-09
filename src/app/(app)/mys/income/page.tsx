import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MysIncomeManager } from "@/components/mys-income-manager";
import { getTranslator } from "@/lib/i18n/locale";

export default async function MysIncomePage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();
  const [{ data: income }, { data: boats }, { data: clients }] = await Promise.all([
    supabase.from("mys_income").select("*").order("income_date", { ascending: false }),
    supabase.from("boats").select("id, name").order("name"),
    supabase.from("mys_clients").select("id, name").order("name"),
  ]);

  // Same combined list as the debts page's client picker: boats first, then
  // ad-hoc mys_clients entries, deduped against any boat name.
  const boatNames = new Set((boats ?? []).map((b) => b.name));
  const clientNames = [...(boats ?? []).map((b) => b.name), ...(clients ?? []).map((c) => c.name).filter((n) => !boatNames.has(n))];

  return <MysIncomeManager income={income ?? []} clientNames={clientNames} locale={locale} />;
}
