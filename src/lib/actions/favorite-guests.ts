"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emptyToNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";

// Adds a favorite guest directly from form fields (used when starring a
// pending/not-yet-saved guest, where there is no booking_guests row yet to
// copy from).
export async function addFavoriteGuest(boatId: string, formData: FormData): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();

    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      const { t } = await getTranslator();
      return { error: t("error_guest_name_required") };
    }
    const passportNumber = emptyToNull(formData.get("passport_number"));
    const nationality = emptyToNull(formData.get("nationality"));
    const dateOfBirth = emptyToNull(formData.get("date_of_birth"));

    const { data: candidates } = await supabase
      .from("favorite_guests")
      .select("id, passport_number")
      .eq("boat_id", boatId)
      .eq("name", name);
    if ((candidates ?? []).some((c) => c.passport_number === passportNumber)) return { error: null };

    const file = formData.get("photo");
    let photoPath: string | null = null;
    if (file instanceof File && file.size > 0) {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      photoPath = `${boatId}/favorites/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("booking-guests")
        .upload(photoPath, file, { contentType: file.type || undefined });
      if (uploadError) return { error: uploadError.message };
    }

    const { error } = await supabase.from("favorite_guests").insert({
      boat_id: boatId,
      name,
      passport_number: passportNumber,
      nationality,
      date_of_birth: dateOfBirth,
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

// Adds a favorite from an existing booking guest - copies the photo into its
// own storage object (under "favorites/") so removing the original booking
// guest later doesn't delete the favorite's photo too.
export async function addFavoriteGuestFromBookingGuest(boatId: string, guestId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();

    const { data: guest, error: guestError } = await supabase
      .from("booking_guests")
      .select("name, passport_number, nationality, date_of_birth, photo_path")
      .eq("id", guestId)
      .single();
    if (guestError || !guest) return { error: guestError?.message ?? "Guest not found" };

    const { data: candidates } = await supabase
      .from("favorite_guests")
      .select("id, passport_number")
      .eq("boat_id", boatId)
      .eq("name", guest.name);
    if ((candidates ?? []).some((c) => c.passport_number === guest.passport_number)) return { error: null };

    let photoPath: string | null = null;
    if (guest.photo_path) {
      photoPath = `${boatId}/favorites/${Date.now()}_${guest.photo_path.split("/").pop()}`;
      const { error: copyError } = await supabase.storage.from("booking-guests").copy(guest.photo_path, photoPath);
      if (copyError) photoPath = null;
    }

    const { error } = await supabase.from("favorite_guests").insert({
      boat_id: boatId,
      name: guest.name,
      passport_number: guest.passport_number,
      nationality: guest.nationality,
      date_of_birth: guest.date_of_birth,
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

export async function removeFavoriteGuest(boatId: string, favoriteId: string, photoPath: string | null) {
  const supabase = await createClient();

  const { error } = await supabase.from("favorite_guests").delete().eq("id", favoriteId);
  if (error) throw new Error(error.message);

  if (photoPath) await supabase.storage.from("booking-guests").remove([photoPath]);
  revalidatePath(`/boats/${boatId}/bookings`);
}
