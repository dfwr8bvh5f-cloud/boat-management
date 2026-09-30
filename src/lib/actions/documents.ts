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

  // The file itself is optional here - present only when she picked a
  // replacement in the edit form (documents-cards.tsx), same "empty means
  // leave it alone" convention every other edit-in-place upload in this
  // app already follows. Uploaded before the row update below so a failed
  // upload never touches the existing, still-valid file_path.
  const file = formData.get("file");
  let newPath: string | null = null;
  if (file instanceof File && file.size > 0) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    newPath = `${boatId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(newPath, file, {
      contentType: file.type || undefined,
    });
    if (uploadError) throw new Error(uploadError.message);
  }

  const { data: existing } = await supabase.from("documents").select("file_path").eq("id", documentId).single();

  const { error } = await supabase
    .from("documents")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      doc_type: (String(formData.get("doc_type") ?? "other") as DocumentType),
      expiry_date: emptyToNull(formData.get("expiry_date")),
      notes: emptyToNull(formData.get("notes")),
      ...(newPath ? { file_path: newPath } : {}),
    })
    .eq("id", documentId);

  if (error) {
    if (newPath) await supabase.storage.from("documents").remove([newPath]);
    throw new Error(error.message);
  }

  if (newPath && existing?.file_path) {
    await supabase.storage.from("documents").remove([existing.file_path]);
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

// Marks this document's current expiry_date as already being handled -
// clears itself the moment the document is edited with a different
// expiry_date, since the fleet "Expiring soon" tile only ever suppresses a
// row while expiry_ack_date still matches expiry_date. Never touches the
// document itself, just quiets the nag for a renewal already in progress.
export async function acknowledgeDocumentExpiry(boatId: string, documentId: string, expiryDate: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({ expiry_ack_date: expiryDate, expiry_acknowledged_at: new Date().toISOString() })
    .eq("id", documentId);

  if (error) throw new Error(error.message);
  revalidatePath("/boats");
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
