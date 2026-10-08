"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import { todayLocalISO } from "@/lib/date-format";
import { getTranslator } from "@/lib/i18n/locale";
import type { BoatInventoryCategory } from "@/lib/types/database";

// Signed upload URL for one item's reference photo - same direct-to-storage
// pattern as createExpenseUploadUrl (src/lib/actions/expenses.ts), just
// under the dedicated "boat-inventory-photos" bucket (0117_boat_inventory_date_photo.sql).
export async function createInventoryUploadUrl(boatId: string, fileName: string) {
  const profile = await requireProfile();
  if (profile.role !== "management" && profile.boat_id !== boatId) {
    const { t } = await getTranslator();
    throw new Error(t("error_not_authorized"));
  }
  const supabase = await createClient();
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${Date.now()}_${safeName}`;
  const { data, error } = await supabase.storage.from("boat-inventory-photos").createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);
  return { path: storagePath, token: data.token };
}

export async function createInventoryItem(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const description = String(formData.get("description") ?? "").trim();
  if (!description) throw new Error("Description is required");
  const category = String(formData.get("category") ?? "other") as BoatInventoryCategory;
  const quantity = Math.max(1, Math.round(Number(formData.get("quantity") ?? 1)));
  const entryDate = emptyToNull(formData.get("entry_date")) ?? todayLocalISO();
  const photoPath = emptyToNull(formData.get("photo_path"));

  const { error } = await supabase.from("boat_inventory_items").insert({
    boat_id: boatId,
    description,
    category,
    quantity,
    entry_date: entryDate,
    photo_path: photoPath,
    created_by: profile.id,
  });

  if (error) {
    if (photoPath) await supabase.storage.from("boat-inventory-photos").remove([photoPath]);
    throw new Error(error.message);
  }
  revalidatePath(`/boats/${boatId}/maintenance/inventory`);
}

export async function updateInventoryItem(boatId: string, itemId: string, formData: FormData) {
  await requireProfile();
  const supabase = await createClient();

  const description = String(formData.get("description") ?? "").trim();
  if (!description) throw new Error("Description is required");
  const category = String(formData.get("category") ?? "other") as BoatInventoryCategory;
  const quantity = Math.max(1, Math.round(Number(formData.get("quantity") ?? 1)));
  const entryDate = emptyToNull(formData.get("entry_date")) ?? todayLocalISO();
  // A newly-picked photo on this exact edit only - the item's existing
  // photo_path (if any and not replaced here) stays untouched, same
  // append-vs-replace split as updateTechnicalSpec's own photoPath handling.
  const newPhotoPath = emptyToNull(formData.get("photo_path"));

  const { error } = await supabase
    .from("boat_inventory_items")
    .update({
      description,
      category,
      quantity,
      entry_date: entryDate,
      ...(newPhotoPath ? { photo_path: newPhotoPath } : {}),
    })
    .eq("id", itemId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/inventory`);
}

export async function removeInventoryPhoto(boatId: string, itemId: string) {
  await requireProfile();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("boat_inventory_items").select("photo_path").eq("id", itemId).single();
  const { error } = await supabase.from("boat_inventory_items").update({ photo_path: null }).eq("id", itemId);
  if (error) throw new Error(error.message);

  if (existing?.photo_path) await supabase.storage.from("boat-inventory-photos").remove([existing.photo_path]);
  revalidatePath(`/boats/${boatId}/maintenance/inventory`);
}

export async function deleteInventoryItem(boatId: string, itemId: string, photoPath: string | null) {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("boat_inventory_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  if (photoPath) await supabase.storage.from("boat-inventory-photos").remove([photoPath]);
  revalidatePath(`/boats/${boatId}/maintenance/inventory`);
}
