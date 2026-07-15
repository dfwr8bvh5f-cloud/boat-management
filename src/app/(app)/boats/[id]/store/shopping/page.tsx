import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls, getCachedThumbUrls } from "@/lib/storage-cache";
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

  // Item photos only ever render as a tiny (28px) list icon - a small
  // transformed rendition covers the only use of this field. Falls back to
  // the plain signed URL if the transform ever comes back empty.
  const itemPaths = [...new Set((items ?? []).flatMap((item) => (item.photo_path ? [item.photo_path] : [])))];
  const [thumbUrlByPath, signedUrlByPath] = await Promise.all([
    getCachedThumbUrls("shopping", itemPaths),
    getCachedSignedUrls("shopping", itemPaths),
  ]);
  const itemsWithUrls = (items ?? []).map((item) => ({
    ...item,
    photoUrl: (item.photo_path && (thumbUrlByPath.get(item.photo_path) ?? signedUrlByPath.get(item.photo_path))) ?? null,
  }));

  const listsWithItems = (lists ?? []).map((list) => ({
    ...list,
    items: itemsWithUrls.filter((it) => it.list_id === list.id),
  }));

  return (
    <ShoppingManager boatId={boat.id} lists={listsWithItems} trips={bookings ?? []} canCreate={canCreate} locale={locale} />
  );
}
