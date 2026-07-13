"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type { ApprovalStatus, DocumentType } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";

export async function uploadDocument(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    const { t } = await getTranslator();
    throw new Error(t("error_select_file"));
  }

  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file, {
    contentType: file.type || undefined,
  });
  if (uploadError) throw new Error(uploadError.message);

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { error: insertError } = await supabase.from("documents").insert({
    boat_id: boatId,
    name: String(formData.get("name") ?? file.name).trim() || file.name,
    doc_type: (String(formData.get("doc_type") ?? "other") as DocumentType),
    file_path: storagePath,
    expiry_date: emptyToNull(formData.get("expiry_date")),
    last_checked_date: emptyToNull(formData.get("last_checked_date")),
    notes: emptyToNull(formData.get("notes")),
    uploaded_by: profile.id,
    status,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (insertError) {
    await supabase.storage.from("documents").remove([storagePath]);
    throw new Error(insertError.message);
  }

  revalidatePath(`/boats/${boatId}/documents`);
}

export async function updateDocument(boatId: string, documentId: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("documents")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      doc_type: (String(formData.get("doc_type") ?? "other") as DocumentType),
      expiry_date: emptyToNull(formData.get("expiry_date")),
      notes: emptyToNull(formData.get("notes")),
    })
    .eq("id", documentId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/documents`);
}

export async function deleteDocument(boatId: string, documentId: string, filePath: string) {
  const supabase = await createClient();

  const { error: deleteRowError } = await supabase.from("documents").delete().eq("id", documentId);
  if (deleteRowError) throw new Error(deleteRowError.message);

  await supabase.storage.from("documents").remove([filePath]);
  revalidatePath(`/boats/${boatId}/documents`);
}

export async function approveDocument(boatId: string, documentId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", documentId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/documents`);
}
