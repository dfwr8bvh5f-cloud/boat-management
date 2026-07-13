"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emptyToNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";

// Returns a result object instead of throwing so the real message always
// reaches the client - Next.js redacts thrown Server Action error messages
// in production builds, turning any failure here into an opaque
// "Something went wrong" page with no way to diagnose it.
export async function addBookingLeg(
  boatId: string,
  bookingId: string,
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const { t } = await getTranslator();

    const legStart = emptyToNull(formData.get("start_date"));
    const legEnd = emptyToNull(formData.get("end_date"));

    if (legStart && legEnd && legStart > legEnd) {
      return { ok: false, error: t("error_leg_dates_invalid_order") };
    }

    if (legStart || legEnd) {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("start_date, end_date")
        .eq("id", bookingId)
        .single();
      if (bookingError || !booking) return { ok: false, error: bookingError?.message ?? "Booking not found" };
      const outOfRange =
        (legStart && (legStart < booking.start_date || legStart > booking.end_date)) ||
        (legEnd && (legEnd < booking.start_date || legEnd > booking.end_date));
      if (outOfRange) return { ok: false, error: t("error_leg_dates_out_of_range") };
    }

    const { count } = await supabase
      .from("booking_legs")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId);

    const { data, error } = await supabase
      .from("booking_legs")
      .insert({
        booking_id: bookingId,
        boat_id: boatId,
        leg_number: (count ?? 0) + 1,
        destination: emptyToNull(formData.get("destination")),
        departure_port: emptyToNull(formData.get("departure_port")),
        arrival_port: emptyToNull(formData.get("arrival_port")),
        start_date: legStart,
        end_date: legEnd,
        notes: emptyToNull(formData.get("notes")),
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };

    revalidatePath(`/boats/${boatId}/bookings`);
    return { ok: true, id: data.id as string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateBookingLeg(
  boatId: string,
  bookingId: string,
  legId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const { t } = await getTranslator();

    const legStart = emptyToNull(formData.get("start_date"));
    const legEnd = emptyToNull(formData.get("end_date"));

    if (legStart && legEnd && legStart > legEnd) {
      return { ok: false, error: t("error_leg_dates_invalid_order") };
    }

    if (legStart || legEnd) {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("start_date, end_date")
        .eq("id", bookingId)
        .single();
      if (bookingError || !booking) return { ok: false, error: bookingError?.message ?? "Booking not found" };
      const outOfRange =
        (legStart && (legStart < booking.start_date || legStart > booking.end_date)) ||
        (legEnd && (legEnd < booking.start_date || legEnd > booking.end_date));
      if (outOfRange) return { ok: false, error: t("error_leg_dates_out_of_range") };
    }

    const { error } = await supabase
      .from("booking_legs")
      .update({
        destination: emptyToNull(formData.get("destination")),
        departure_port: emptyToNull(formData.get("departure_port")),
        arrival_port: emptyToNull(formData.get("arrival_port")),
        start_date: legStart,
        end_date: legEnd,
        notes: emptyToNull(formData.get("notes")),
      })
      .eq("id", legId);

    if (error) return { ok: false, error: error.message };

    revalidatePath(`/boats/${boatId}/bookings`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Guests attached to this leg (booking_guests.leg_id) cascade-delete with it.
export async function removeBookingLeg(boatId: string, legId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("booking_legs").delete().eq("id", legId);
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/bookings`);
}
