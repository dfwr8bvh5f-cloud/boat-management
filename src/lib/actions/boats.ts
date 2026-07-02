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
      home_port: emptyToNull(formData.get("home_port")),
      status: (String(formData.get("status") ?? "active") as BoatStatus),
      boat_type: (String(formData.get("boat_type") ?? "private") as BoatType),
      sale_price: numberOrNull(formData.get("sale_price")),
      notes: emptyToNull(formData.get("notes")),
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
