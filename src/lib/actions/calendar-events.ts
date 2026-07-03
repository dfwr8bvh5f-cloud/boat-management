"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export async function createBoatEvent(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("boat_events").insert({
    boat_id: boatId,
    title: String(formData.get("title") ?? "").trim(),
    event_date: String(formData.get("event_date") ?? ""),
    created_by: profile.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/bookings`);
}

export async function deleteBoatEvent(boatId: string, eventId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("boat_events").delete().eq("id", eventId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/bookings`);
}
