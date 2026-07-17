"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";
import type { BoatStatus, BoatType } from "@/lib/types/database";

async function assertManagement(role: string) {
  if (role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_action"));
  }
}

export async function createBoat(formData: FormData) {
  const profile = await requireProfile();
  await assertManagement(profile.role);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boats")
    .insert({
      name: String(formData.get("name") ?? "").trim(),
      model: emptyToNull(formData.get("model")),
      registration_number: emptyToNull(formData.get("registration_number")),
      year_built: numberOrNull(formData.get("year_built")),
      length_meters: numberOrNull(formData.get("length_meters")),
      beam_meters: numberOrNull(formData.get("beam_meters")),
      draft_meters: numberOrNull(formData.get("draft_meters")),
      flag: emptyToNull(formData.get("flag")),
      berth: emptyToNull(formData.get("berth")),
      mmsi: emptyToNull(formData.get("mmsi")),
      home_port: emptyToNull(formData.get("home_port")),
      status: (String(formData.get("status") ?? "active") as BoatStatus),
      boat_type: (String(formData.get("boat_type") ?? "private") as BoatType),
      sale_price: numberOrNull(formData.get("sale_price")),
      notes: emptyToNull(formData.get("notes")),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/boats");
  redirect(`/boats/${data.id}`);
}

export async function updateBoat(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  await assertManagement(profile.role);

  const supabase = await createClient();
  const { error } = await supabase
    .from("boats")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      model: emptyToNull(formData.get("model")),
      registration_number: emptyToNull(formData.get("registration_number")),
      year_built: numberOrNull(formData.get("year_built")),
      length_meters: numberOrNull(formData.get("length_meters")),
      beam_meters: numberOrNull(formData.get("beam_meters")),
      draft_meters: numberOrNull(formData.get("draft_meters")),
      flag: emptyToNull(formData.get("flag")),
      berth: emptyToNull(formData.get("berth")),
      mmsi: emptyToNull(formData.get("mmsi")),
      home_port: emptyToNull(formData.get("home_port")),
      status: (String(formData.get("status") ?? "active") as BoatStatus),
      boat_type: (String(formData.get("boat_type") ?? "private") as BoatType),
      sale_price: numberOrNull(formData.get("sale_price")),
      notes: emptyToNull(formData.get("notes")),
      parent_boat_id: emptyToNull(formData.get("parent_boat_id")),
    })
    .eq("id", boatId);

  if (error) throw new Error(error.message);

  revalidatePath("/boats");
  revalidatePath(`/boats/${boatId}`);
}

export async function deleteBoat(boatId: string) {
  const profile = await requireProfile();
  await assertManagement(profile.role);

  const supabase = await createClient();
  const { error } = await supabase.from("boats").delete().eq("id", boatId);
  if (error) throw new Error(error.message);

  revalidatePath("/boats");
  redirect("/boats");
}

async function assertCanEditBoat(_boatId: string) {
  const profile = await requireProfile();
  await assertManagement(profile.role);
}

// Any role assigned to this boat (captain or owner) can add photos, not
// just management.
async function assertCanUploadPhotos(boatId: string) {
  const profile = await requireProfile();
  if (profile.role === "management" || profile.boat_id === boatId) return profile;
  const { t } = await getTranslator();
  throw new Error(t("error_not_authorized"));
}

// Removing photos or picking the primary one stays management/captain
// only, matching the rest of the app's write permissions on the boat row.
async function assertCanManagePhotos(boatId: string) {
  const profile = await requireProfile();
  if (profile.role === "management" || (profile.role === "captain" && profile.boat_id === boatId)) return profile;
  const { t } = await getTranslator();
  throw new Error(t("error_not_authorized"));
}

async function uploadBoatPhoto(boatId: string, field: "logo_path" | "image_path", file: File) {
  await assertCanEditBoat(boatId);

  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${field}_${Date.now()}_${safeName}`;

  const { data: existing } = await supabase.from("boats").select("logo_path, image_path").eq("id", boatId).single();
  const previousPath = existing?.[field];

  const { error: uploadError } = await supabase.storage
    .from("boat-photos")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await supabase
    .from("boats")
    .update(field === "logo_path" ? { logo_path: storagePath } : { image_path: storagePath })
    .eq("id", boatId);

  if (updateError) {
    await supabase.storage.from("boat-photos").remove([storagePath]);
    throw new Error(updateError.message);
  }

  if (previousPath) {
    await supabase.storage.from("boat-photos").remove([previousPath]);
  }

  revalidatePath("/boats");
  revalidatePath(`/boats/${boatId}`);
}

async function assertNotPdf(file: File) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { t } = await getTranslator();
    throw new Error(t("error_pdf_not_supported"));
  }
}

export async function uploadBoatLogo(boatId: string, formData: FormData) {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    const { t } = await getTranslator();
    throw new Error(t("error_select_file"));
  }
  await assertNotPdf(file);
  await uploadBoatPhoto(boatId, "logo_path", file);
}

export async function removeBoatLogo(boatId: string) {
  await assertCanEditBoat(boatId);
  const supabase = await createClient();

  const { data: existing } = await supabase.from("boats").select("logo_path").eq("id", boatId).single();
  const { error } = await supabase.from("boats").update({ logo_path: null }).eq("id", boatId);
  if (error) throw new Error(error.message);

  if (existing?.logo_path) await supabase.storage.from("boat-photos").remove([existing.logo_path]);

  revalidatePath("/boats");
  revalidatePath(`/boats/${boatId}`);
}

export async function uploadGalleryPhoto(boatId: string, formData: FormData) {
  const profile = await assertCanUploadPhotos(boatId);

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    const { t } = await getTranslator();
    throw new Error(t("error_select_file"));
  }
  await assertNotPdf(file);

  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/gallery_${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("boat-photos")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase
    .from("boat_gallery_photos")
    .insert({ boat_id: boatId, photo_path: storagePath, created_by: profile.id });
  if (error) {
    await supabase.storage.from("boat-photos").remove([storagePath]);
    throw new Error(error.message);
  }

  revalidatePath("/boats");
  revalidatePath(`/boats/${boatId}`);
}

export async function deleteGalleryPhoto(boatId: string, photoId: string, photoPath: string) {
  await assertCanManagePhotos(boatId);

  const supabase = await createClient();
  const { error } = await supabase.from("boat_gallery_photos").delete().eq("id", photoId);
  if (error) throw new Error(error.message);

  await supabase.storage.from("boat-photos").remove([photoPath]);
  revalidatePath("/boats");
  revalidatePath(`/boats/${boatId}`);
}

export async function setPrimaryBoatImage(boatId: string, photoPath: string) {
  await assertCanManagePhotos(boatId);

  const supabase = await createClient();
  const { error } = await supabase.from("boats").update({ image_path: photoPath }).eq("id", boatId);
  if (error) throw new Error(error.message);

  revalidatePath("/boats");
  revalidatePath(`/boats/${boatId}`);
}
