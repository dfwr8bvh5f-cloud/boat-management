"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type { DocumentType } from "@/lib/types/database";

export async function uploadDocument(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("יש לבחור קובץ");
  }

  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file, {
    contentType: file.type || undefined,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error: insertError } = await supabase.from("documents").insert({
    boat_id: boatId,
    name: String(formData.get("name") ?? file.name).trim() || file.name,
    doc_type: (String(formData.get("doc_type") ?? "other") as DocumentType),
    file_path: storagePath,
    expiry_date: emptyToNull(formData.get("expiry_date")),
    uploaded_by: profile.id,
  });

  if (insertError) {
    await supabase.storage.from("documents").remove([storagePath]);
    throw new Error(insertError.message);
  }

  revalidatePath(`/boats/${boatId}/documents`);
}

export async function deleteDocument(boatId: string, documentId: string, filePath: string) {
  const supabase = await createClient();

  const { error: deleteRowError } = await supabase.from("documents").delete().eq("id", documentId);
  if (deleteRowError) throw new Error(deleteRowError.message);

  await supabase.storage.from("documents").remove([filePath]);
  revalidatePath(`/boats/${boatId}/documents`);
}
