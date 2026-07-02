"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emptyToNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";

export async function addBookingGuest(boatId: string, bookingId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    const { t } = await getTranslator();
    throw new Error(t("error_guest_name_required"));
  }

  const file = formData.get("photo");
  let photoPath: string | null = null;
  if (file instanceof File && file.size > 0) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    photoPath = `${boatId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("booking-guests")
      .upload(photoPath, file, { contentType: file.type || undefined });
    if (uploadError) throw new Error(uploadError.message);
  }

  const { error } = await supabase.from("booking_guests").insert({
    booking_id: bookingId,
    boat_id: boatId,
    name,
    passport_number: emptyToNull(formData.get("passport_number")),
    nationality: emptyToNull(formData.get("nationality")),
    date_of_birth: emptyToNull(formData.get("date_of_birth")),
    photo_path: photoPath,
  });

  if (error) {
    if (photoPath) await supabase.storage.from("booking-guests").remove([photoPath]);
    throw new Error(error.message);
  }

  revalidatePath(`/boats/${boatId}/bookings`);
}

export async function removeBookingGuest(boatId: string, guestId: string, photoPath: string | null) {
  const supabase = await createClient();

  const { error } = await supabase.from("booking_guests").delete().eq("id", guestId);
  if (error) throw new Error(error.message);

  if (photoPath) await supabase.storage.from("booking-guests").remove([photoPath]);
  revalidatePath(`/boats/${boatId}/bookings`);
}
