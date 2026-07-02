"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type { ApprovalStatus } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";

export async function createSafetyItem(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    const { t } = await getTranslator();
    throw new Error(t("error_item_name_required"));
  }

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

  // Same role-based approval stamping as the rest of `documents` - the
  // insert RLS policy requires captain-authored rows to start 'pending', so
  // this can't be special-cased to always-approved without a policy carve-out.
  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { error } = await supabase.from("documents").insert({
    boat_id: boatId,
    name,
    doc_type: "safety",
    file_path: storagePath ?? "",
    expiry_date: emptyToNull(formData.get("expiry_date")),
    last_checked_date: emptyToNull(formData.get("last_checked_date")),
    uploaded_by: profile.id,
    status,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
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

export async function approveSafetyItem(boatId: string, itemId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", itemId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/safety`);
}
