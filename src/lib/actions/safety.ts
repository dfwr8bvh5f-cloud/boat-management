"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";

export async function createSafetyItem(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("יש להזין שם פריט");

  const file = formData.get("file");
  let storagePath: string | null = null;
  if (file instanceof File && file.size > 0) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    storagePath = `${boatId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file, { contentType: file.type || undefined });
    if (uploadError) throw new Error(uploadError.message);
  }

  const { error } = await supabase.from("documents").insert({
    boat_id: boatId,
    name,
    doc_type: "safety",
    file_path: storagePath ?? "",
    expiry_date: emptyToNull(formData.get("expiry_date")),
    last_checked_date: emptyToNull(formData.get("last_checked_date")),
    uploaded_by: profile.id,
  });

  if (error) {
    if (storagePath) await supabase.storage.from("documents").remove([storagePath]);
    throw new Error(error.message);
  }

  revalidatePath(`/boats/${boatId}/maintenance/safety`);
}

export async function deleteSafetyItem(boatId: string, itemId: string, filePath: string | null) {
  const supabase = await createClient();

  const { error } = await supabase.from("documents").delete().eq("id", itemId);
  if (error) throw new Error(error.message);

  if (filePath) await supabase.storage.from("documents").remove([filePath]);
  revalidatePath(`/boats/${boatId}/maintenance/safety`);
}
