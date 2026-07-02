"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/locale";
import type { ShoppingUnit } from "@/lib/types/database";

type BasketItem = { name: string; quantity: number; unit: ShoppingUnit; photoPath: string | null };

export async function createShoppingList(
  boatId: string,
  title: string,
  bookingId: string | null,
  basket: BasketItem[]
) {
  const profile = await requireProfile();
  const { t } = await getTranslator();
  if (basket.length === 0) throw new Error(t("error_basket_empty"));

  const supabase = await createClient();

  const { data: list, error: listError } = await supabase
    .from("shopping_lists")
    .insert({
      boat_id: boatId,
      title: title.trim() || `${t("shopping_list_default_title")} ${new Date().toISOString().slice(0, 10)}`,
      booking_id: bookingId,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (listError) throw new Error(listError.message);

  const { error: itemsError } = await supabase.from("shopping_list_items").insert(
    basket.map((item) => ({
      list_id: list.id,
      boat_id: boatId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      photo_path: item.photoPath,
    }))
  );

  if (itemsError) throw new Error(itemsError.message);
  revalidatePath(`/boats/${boatId}/store/shopping`);
}

export async function uploadShoppingItemPhoto(boatId: string, file: File): Promise<string> {
  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from("shopping").upload(storagePath, file, {
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);
  return storagePath;
}

export async function toggleShoppingItem(boatId: string, itemId: string, checked: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("shopping_list_items").update({ checked }).eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/store/shopping`);
}

export async function deleteShoppingList(boatId: string, listId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("shopping_lists").delete().eq("id", listId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/store/shopping`);
}
