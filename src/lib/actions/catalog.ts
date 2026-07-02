"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export async function addCatalogPhoto(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("יש לבחור תמונה");
  }

  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("catalog")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { error: insertError } = await supabase.from("catalog_photos").insert({
    boat_id: boatId,
    photo_path: storagePath,
    created_by: profile.id,
  });

  if (insertError) {
    await supabase.storage.from("catalog").remove([storagePath]);
    throw new Error(insertError.message);
  }

  revalidatePath(`/boats/${boatId}/catalog`);
}

export async function removeCatalogPhoto(boatId: string, photoId: string, photoPath: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("catalog_photos").delete().eq("id", photoId);
  if (error) throw new Error(error.message);

  await supabase.storage.from("catalog").remove([photoPath]);
  revalidatePath(`/boats/${boatId}/catalog`);
}
