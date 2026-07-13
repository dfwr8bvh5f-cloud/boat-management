"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emptyToNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";

// Returns a result object instead of throwing so the real message always
// reaches the client - Next.js redacts thrown Server Action error messages
// in production builds, turning any failure here into an opaque
// "Something went wrong" page with no way to diagnose it.
export async function addBookingGuest(
  boatId: string,
  bookingId: string,
  formData: FormData,
  legId?: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();

    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      const { t } = await getTranslator();
      return { error: t("error_guest_name_required") };
    }

    const file = formData.get("photo");
    let photoPath: string | null = null;
    if (file instanceof File && file.size > 0) {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      photoPath = `${boatId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("booking-guests")
        .upload(photoPath, file, { contentType: file.type || undefined });
      if (uploadError) return { error: uploadError.message };
    }

    const { error } = await supabase.from("booking_guests").insert({
      booking_id: bookingId,
      boat_id: boatId,
      leg_id: legId ?? null,
      name,
      passport_number: emptyToNull(formData.get("passport_number")),
      nationality: emptyToNull(formData.get("nationality")),
      date_of_birth: emptyToNull(formData.get("date_of_birth")),
      photo_path: photoPath,
    });

    if (error) {
      if (photoPath) await supabase.storage.from("booking-guests").remove([photoPath]);
      return { error: error.message };
    }

    revalidatePath(`/boats/${boatId}/bookings`);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeBookingGuest(boatId: string, guestId: string, photoPath: string | null) {
  const supabase = await createClient();

  const { error } = await supabase.from("booking_guests").delete().eq("id", guestId);
  if (error) throw new Error(error.message);

  if (photoPath) await supabase.storage.from("booking-guests").remove([photoPath]);
  revalidatePath(`/boats/${boatId}/bookings`);
}
