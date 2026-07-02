"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import type { BoatStatus, BoatType } from "@/lib/types/database";

function assertManagement(role: string) {
  if (role !== "management") {
    throw new Error("פעולה זו זמינה לתפקיד ניהול בלבד");
  }
}

export async function createBoat(formData: FormData) {
  const profile = await requireProfile();
  assertManagement(profile.role);

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
  if (profile.role !== "management" && !(profile.role === "captain" && profile.boat_id === boatId)) {
    throw new Error("אין הרשאה לערוך סירה זו");
  }

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
      // Only present when management's BoatForm rendered the parent-boat
      // select - omit otherwise so a captain's save can't clear it.
      ...(formData.has("parent_boat_id") ? { parent_boat_id: emptyToNull(formData.get("parent_boat_id")) } : {}),
    })
    .eq("id", boatId);

  if (error) throw new Error(error.message);

  revalidatePath("/boats");
  revalidatePath(`/boats/${boatId}`);
}

export async function deleteBoat(boatId: string) {
  const profile = await requireProfile();
  assertManagement(profile.role);

  const supabase = await createClient();
  const { error } = await supabase.from("boats").delete().eq("id", boatId);
  if (error) throw new Error(error.message);

  revalidatePath("/boats");
  redirect("/boats");
}

async function assertCanEditBoat(boatId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management" && !(profile.role === "captain" && profile.boat_id === boatId)) {
    throw new Error("אין הרשאה לערוך סירה זו");
  }
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

export async function uploadBoatLogo(boatId: string, formData: FormData) {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) throw new Error("יש לבחור תמונה");
  await uploadBoatPhoto(boatId, "logo_path", file);
}

export async function uploadBoatImage(boatId: string, formData: FormData) {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) throw new Error("יש לבחור תמונה");
  await uploadBoatPhoto(boatId, "image_path", file);
}
