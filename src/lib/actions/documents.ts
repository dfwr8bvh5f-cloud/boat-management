"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireBoatAccess } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type { ApprovalStatus, DocumentType } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";

// Signed upload URL so the browser uploads the file straight to Supabase
// Storage. A server action's request body is capped around 4.5MB by Vercel no
// matter what, which is what made larger documents fail; only the resulting
// path (see `file_path` below) crosses into uploadDocument/updateDocument.
export async function createDocumentUploadUrl(boatId: string, fileName: string) {
  await requireBoatAccess(boatId);
  const supabase = await createClient();
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${Date.now()}_${safeName}`;
  const { data, error } = await supabase.storage.from("documents").createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);
  return { path: storagePath, token: data.token };
}

// A path the client reports as already uploaded must live under this boat's
// own folder - never trust it to point at another boat's file.
function directUploadPath(boatId: string, formData: FormData): string | null {
  const path = formData.get("file_path");
  return typeof path === "string" && path.startsWith(`${boatId}/`) && !path.includes("..") ? path : null;
}

// Failures are returned as { error } rather than thrown: a thrown error's
// message is redacted by Next.js in production, which left the form showing
// only a generic "Server Components render" text with nothing to act on.
// The real cause is logged server-side and shown (translated prefix + detail).
export async function uploadDocument(boatId: string, formData: FormData): Promise<{ error: string } | undefined> {
  const profile = await requireBoatAccess(boatId);
  const file = formData.get("file");
  const directPath = directUploadPath(boatId, formData);

  const { t } = await getTranslator();
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !directPath) {
    return { error: t("error_select_file") };
  }

  const supabase = await createClient();
  const fileName = directPath ? String(formData.get("file_name") ?? "").trim() || directPath.split("/").pop()! : (file as File).name;
  let storagePath: string;
  if (directPath) {
    // Already uploaded by the browser (createDocumentUploadUrl).
    storagePath = directPath;
  } else {
    const upload = file as File;
    const safeName = upload.name.replace(/[^\w.\-]+/g, "_");
    storagePath = `${boatId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, upload, {
      contentType: upload.type || undefined,
    });
    if (uploadError) {
      console.error("uploadDocument: storage upload failed", { boatId, storagePath, size: upload.size, type: upload.type }, uploadError);
      return { error: `${t("save_failed")}: ${uploadError.message}` };
    }
  }

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { error: insertError } = await supabase.from("documents").insert({
    boat_id: boatId,
    name: String(formData.get("name") ?? fileName).trim() || fileName,
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
    console.error("uploadDocument: insert failed", { boatId, storagePath }, insertError);
    await supabase.storage.from("documents").remove([storagePath]);
    return { error: `${t("save_failed")}: ${insertError.message}` };
  }

  revalidatePath(`/boats/${boatId}/documents`);
}

export async function updateDocument(boatId: string, documentId: string, formData: FormData) {
  await requireBoatAccess(boatId);
  const supabase = await createClient();

  // The file itself is optional here - present only when she picked a
  // replacement in the edit form (documents-cards.tsx), same "empty means
  // leave it alone" convention every other edit-in-place upload in this
  // app already follows. Uploaded before the row update below so a failed
  // upload never touches the existing, still-valid file_path.
  const file = formData.get("file");
  let newPath: string | null = directUploadPath(boatId, formData);
  if (!newPath && file instanceof File && file.size > 0) {
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
  await requireBoatAccess(boatId);
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
  await requireBoatAccess(boatId);
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
