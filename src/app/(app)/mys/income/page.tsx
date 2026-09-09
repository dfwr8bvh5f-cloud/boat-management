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
  const { data: income } = await supabase.from("mys_income").select("*").order("income_date", { ascending: false });

  return <MysIncomeManager income={income ?? []} locale={locale} />;
}
