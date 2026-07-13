"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emptyToNull } from "@/lib/form-utils";

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

// Guests attached to this leg (booking_guests.leg_id) cascade-delete with it.
export async function removeBookingLeg(boatId: string, legId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("booking_legs").delete().eq("id", legId);
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/bookings`);
}
