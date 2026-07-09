"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type { ApprovalStatus, TechnicalSpecCategory } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";

async function uploadSpecPhoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  file: File
): Promise<string> {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from("technical-spec-photos")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return storagePath;
}

export async function createTechnicalSpec(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    const { t } = await getTranslator();
    throw new Error(t("error_item_name_required"));
  }

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
  const photoFile = formData.get("photo");
  const photoPath =
    photoFile instanceof File && photoFile.size > 0 ? await uploadSpecPhoto(supabase, boatId, photoFile) : null;

  const { error } = await supabase.from("technical_specs").insert({
    boat_id: boatId,
    category: (String(formData.get("category") ?? "other") as TechnicalSpecCategory),
    name,
    model: emptyToNull(formData.get("model")),
    serial_number: emptyToNull(formData.get("serial_number")),
    details: emptyToNull(formData.get("details")),
    photo_path: photoPath,
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) {
    if (photoPath) await supabase.storage.from("technical-spec-photos").remove([photoPath]);
    throw new Error(error.message);
  }
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
}

export async function updateTechnicalSpec(boatId: string, specId: string, formData: FormData) {
  const supabase = await createClient();

  const photoFile = formData.get("photo");
  const photoPath =
    photoFile instanceof File && photoFile.size > 0 ? await uploadSpecPhoto(supabase, boatId, photoFile) : undefined;

  const { error } = await supabase
    .from("technical_specs")
    .update({
      category: (String(formData.get("category") ?? "other") as TechnicalSpecCategory),
      name: String(formData.get("name") ?? "").trim(),
      model: emptyToNull(formData.get("model")),
      serial_number: emptyToNull(formData.get("serial_number")),
      details: emptyToNull(formData.get("details")),
      ...(photoPath ? { photo_path: photoPath } : {}),
    })
    .eq("id", specId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
}

export async function removeTechnicalSpecPhoto(boatId: string, specId: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase.from("technical_specs").select("photo_path").eq("id", specId).single();
  const { error } = await supabase.from("technical_specs").update({ photo_path: null }).eq("id", specId);
  if (error) throw new Error(error.message);

  if (existing?.photo_path) await supabase.storage.from("technical-spec-photos").remove([existing.photo_path]);
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
}

export async function deleteTechnicalSpec(boatId: string, specId: string, photoPath: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("technical_specs").delete().eq("id", specId);
  if (error) throw new Error(error.message);
  if (photoPath) await supabase.storage.from("technical-spec-photos").remove([photoPath]);
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
}

export async function approveTechnicalSpec(boatId: string, specId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("technical_specs")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", specId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
}
