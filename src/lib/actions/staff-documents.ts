"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/locale";

export async function addStaffIdDocument(
  boatId: string,
  staffId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();

    const file = formData.get("id_document");
    if (!(file instanceof File) || file.size === 0) {
      const { t } = await getTranslator();
      return { error: t("error_select_file") };
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const filePath = `${boatId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("staff-files")
      .upload(filePath, file, { contentType: file.type || undefined });
    if (uploadError) return { error: uploadError.message };

    const { error } = await supabase.from("staff_id_documents").insert({
      staff_id: staffId,
      boat_id: boatId,
      file_path: filePath,
    });

    if (error) {
      await supabase.storage.from("staff-files").remove([filePath]);
      return { error: error.message };
    }

    revalidatePath(`/boats/${boatId}/staff`);
    return { error: null };
  } catch (e) {
    console.error("addStaffIdDocument failed:", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeStaffIdDocument(boatId: string, documentId: string, filePath: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("staff_id_documents").delete().eq("id", documentId);
  if (error) throw new Error(error.message);

  await supabase.storage.from("staff-files").remove([filePath]);
  revalidatePath(`/boats/${boatId}/staff`);
}
