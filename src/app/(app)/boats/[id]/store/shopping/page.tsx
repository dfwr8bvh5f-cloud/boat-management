import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { ShoppingManager } from "@/components/shopping-manager";
import { getLocale } from "@/lib/i18n/locale";

export default async function ShoppingListsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile } = await getBoatContext(id);
  const canCreate = profile.role === "owner" || profile.role === "management";
  const locale = await getLocale();

  const supabase = await createClient();
  const [{ data: lists }, { data: items }, { data: bookings }] = await Promise.all([
    supabase.from("shopping_lists").select("*").eq("boat_id", boat.id).order("created_at", { ascending: false }),
    supabase.from("shopping_list_items").select("*").eq("boat_id", boat.id).order("created_at"),
    supabase
      .from("bookings")
      .select("id, customer_name, start_date, end_date")
      .eq("boat_id", boat.id)
      .order("start_date"),
  ]);

  const itemsWithUrls = await Promise.all(
    (items ?? []).map(async (item) => {
      if (!item.photo_path) return { ...item, photoUrl: null };
      const { data } = await supabase.storage.from("shopping").createSignedUrl(item.photo_path, 3600);
      return { ...item, photoUrl: data?.signedUrl ?? null };
    })
  );

  const listsWithItems = (lists ?? []).map((list) => ({
    ...list,
    items: itemsWithUrls.filter((it) => it.list_id === list.id),
  }));

  return (
    <ShoppingManager boatId={boat.id} lists={listsWithItems} trips={bookings ?? []} canCreate={canCreate} locale={locale} />
  );
}
