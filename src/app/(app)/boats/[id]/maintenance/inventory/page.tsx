import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { BoatInventoryManager } from "@/components/boat-inventory-manager";
import { getLocale } from "@/lib/i18n/locale";
import type { BoatInventoryItem } from "@/lib/types/database";

export default async function BoatInventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const { data: items } = await supabase.from("boat_inventory_items").select("*").eq("boat_id", boat.id);

  const boatLogoUrl = boat.logo_path ? supabase.storage.from("boat-photos").getPublicUrl(boat.logo_path).data.publicUrl : null;

  return (
    <BoatInventoryManager
      boatId={boat.id}
      boatName={boat.name}
      boatLogoUrl={boatLogoUrl}
      items={(items ?? []) as BoatInventoryItem[]}
      canAdd={canEdit}
      locale={locale}
    />
  );
}
