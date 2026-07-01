"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import type { BookingStatus } from "@/lib/types/database";

export async function createBooking(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("bookings").insert({
    boat_id: boatId,
    customer_name: String(formData.get("customer_name") ?? "").trim(),
    customer_phone: emptyToNull(formData.get("customer_phone")),
    customer_email: emptyToNull(formData.get("customer_email")),
    start_date: String(formData.get("start_date") ?? ""),
    end_date: String(formData.get("end_date") ?? ""),
    status: (String(formData.get("status") ?? "pending") as BookingStatus),
    price: numberOrNull(formData.get("price")),
    notes: emptyToNull(formData.get("notes")),
    created_by: profile.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/bookings`);
}

export async function deleteBooking(boatId: string, bookingId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/bookings`);
}
