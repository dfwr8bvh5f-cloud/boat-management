import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { TechnicalSpecsManager } from "@/components/technical-specs-manager";
import { getLocale } from "@/lib/i18n/locale";

export default async function TechnicalSpecsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const { data: specs } = await supabase
    .from("technical_specs")
    .select("*")
    .eq("boat_id", boat.id)
    .order("category")
    .order("created_at");

  return (
    <TechnicalSpecsManager
      boatId={boat.id}
      specs={specs ?? []}
      canAdd={canEdit}
      isManagement={profile.role === "management"}
      locale={locale}
    />
  );
}
