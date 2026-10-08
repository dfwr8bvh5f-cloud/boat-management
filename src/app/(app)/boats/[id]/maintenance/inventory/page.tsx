import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls, getCachedThumbUrls } from "@/lib/storage-cache";
import { BoatInventoryManager } from "@/components/boat-inventory-manager";
import { getLocale } from "@/lib/i18n/locale";
import type { BoatInventoryItem } from "@/lib/types/database";

export default async function BoatInventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const { data: items } = await supabase.from("boat_inventory_items").select("*").eq("boat_id", boat.id);

  // Same small-transformed-rendition-first pattern as technical_specs'
  // own photos (specs/page.tsx) - these only ever render at list-row size.
  const photoPaths = [...new Set((items ?? []).map((i) => i.photo_path).filter((p): p is string => Boolean(p)))];
  const [thumbUrlByPath, fullUrlByPath] = await Promise.all([
    getCachedThumbUrls("boat-inventory-photos", photoPaths),
    getCachedSignedUrls("boat-inventory-photos", photoPaths),
  ]);

  const withUrls = (items ?? []).map((i) => ({
    ...i,
    photoUrl: (i.photo_path && (thumbUrlByPath.get(i.photo_path) ?? fullUrlByPath.get(i.photo_path))) ?? null,
  }));

  const boatLogoUrl = boat.logo_path ? supabase.storage.from("boat-photos").getPublicUrl(boat.logo_path).data.publicUrl : null;

  return (
    <BoatInventoryManager
      boatId={boat.id}
      boatName={boat.name}
      boatLogoUrl={boatLogoUrl}
      items={withUrls as (BoatInventoryItem & { photoUrl: string | null })[]}
      canAdd={canEdit}
      locale={locale}
    />
  );
}
