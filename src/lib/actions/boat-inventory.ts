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

function pickPhotoPaths(formData: FormData): string[] {
  return formData.getAll("photo_paths").filter((v): v is string => typeof v === "string" && v.length > 0);
}

// Any photo beyond an item's first goes here, one row per file - the
// legacy single photo_path column stays populated with the first photo too
// (see createInventoryItem/updateInventoryItem), same shape as
// insertExpenseAttachments (src/lib/actions/expenses.ts). Best-effort
// (logged, not thrown) unlike that one, specifically so this degrades
// gracefully rather than breaking the item's own save (which already
// worked before this feature existed) on a site that hasn't run
// 0120_boat_inventory_item_photos.sql yet.
async function insertInventoryPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  itemId: string,
  paths: string[],
  createdBy: string | null
) {
  if (paths.length === 0) return;
  const { error } = await supabase
    .from("boat_inventory_item_photos")
    .insert(paths.map((file_path) => ({ item_id: itemId, boat_id: boatId, file_path, created_by: createdBy })));
  if (error) console.error("insertInventoryPhotos: failed to save additional photo(s)", error);
}

export async function createInventoryItem(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const description = String(formData.get("description") ?? "").trim();
  if (!description) throw new Error("Description is required");
  const category = String(formData.get("category") ?? "other") as BoatInventoryCategory;
  const quantity = Math.max(1, Math.round(Number(formData.get("quantity") ?? 1)));
  const entryDate = emptyToNull(formData.get("entry_date")) ?? todayLocalISO();
  const photoPaths = pickPhotoPaths(formData);

  const { data: inserted, error } = await supabase
    .from("boat_inventory_items")
    .insert({
      boat_id: boatId,
      description,
      category,
      quantity,
      entry_date: entryDate,
      photo_path: photoPaths[0] ?? null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    if (photoPaths.length > 0) await supabase.storage.from("boat-inventory-photos").remove(photoPaths);
    throw new Error(error?.message ?? "Failed to create inventory item");
  }

  await insertInventoryPhotos(supabase, boatId, inserted.id, photoPaths, profile.id);
  revalidatePath(`/boats/${boatId}/maintenance/inventory`);
}

export async function updateInventoryItem(boatId: string, itemId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("boat_inventory_items").select("photo_path").eq("id", itemId).single();

  const description = String(formData.get("description") ?? "").trim();
  if (!description) throw new Error("Description is required");
  const category = String(formData.get("category") ?? "other") as BoatInventoryCategory;
  const quantity = Math.max(1, Math.round(Number(formData.get("quantity") ?? 1)));
  const entryDate = emptyToNull(formData.get("entry_date")) ?? todayLocalISO();
  // Newly-picked photos on this exact edit - the item's existing photo_path
  // (if any) stays untouched; an item that never had one gets its first
  // new photo filled in there too, same as updateExpense's own
  // receipt_path/photo_path handling.
  const photoPaths = pickPhotoPaths(formData);

  const { error } = await supabase
    .from("boat_inventory_items")
    .update({
      description,
      category,
      quantity,
      entry_date: entryDate,
      ...(!existing?.photo_path && photoPaths[0] ? { photo_path: photoPaths[0] } : {}),
    })
    .eq("id", itemId);

  if (error) throw new Error(error.message);

  await insertInventoryPhotos(supabase, boatId, itemId, photoPaths, profile.id);
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

export async function removeInventoryAttachmentPhoto(boatId: string, photoId: string, filePath: string) {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("boat_inventory_item_photos").delete().eq("id", photoId);
  if (error) throw new Error(error.message);

  await supabase.storage.from("boat-inventory-photos").remove([filePath]);
  revalidatePath(`/boats/${boatId}/maintenance/inventory`);
}

export async function deleteInventoryItem(boatId: string, itemId: string, photoPath: string | null) {
  await requireProfile();
  const supabase = await createClient();

  const { data: attachments } = await supabase.from("boat_inventory_item_photos").select("file_path").eq("item_id", itemId);

  const { error } = await supabase.from("boat_inventory_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);

  const paths = [...(photoPath ? [photoPath] : []), ...(attachments ?? []).map((a) => a.file_path)];
  if (paths.length > 0) await supabase.storage.from("boat-inventory-photos").remove(paths);
  revalidatePath(`/boats/${boatId}/maintenance/inventory`);
}
