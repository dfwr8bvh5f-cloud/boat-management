import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TechniciansManager } from "@/components/technicians-manager";
import { getTranslator } from "@/lib/i18n/locale";

export default async function TechniciansPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { t, locale } = await getTranslator();
  const supabase = await createClient();
  const { data: technicians } = await supabase.from("technicians").select("*").order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("nav_technicians")}</h1>
      <TechniciansManager technicians={technicians ?? []} locale={locale} />
    </div>
  );
}
