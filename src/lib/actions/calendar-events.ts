"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

// Returns a result object instead of throwing so the real message always
// reaches the client - Next.js redacts thrown Server Action error messages
// in production builds, turning any failure here into an opaque
// "Something went wrong" page with no way to diagnose it.
export async function createBoatEvent(boatId: string, formData: FormData): Promise<{ error: string | null }> {
  try {
    const profile = await requireProfile();
    const supabase = await createClient();

    const { error } = await supabase.from("boat_events").insert({
      boat_id: boatId,
      title: String(formData.get("title") ?? "").trim(),
      event_date: String(formData.get("event_date") ?? ""),
      created_by: profile.id,
    });

    if (error) return { error: error.message };
    revalidatePath(`/boats/${boatId}/bookings`);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateBoatEvent(boatId: string, eventId: string, formData: FormData): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("boat_events")
      .update({
        title: String(formData.get("title") ?? "").trim(),
        event_date: String(formData.get("event_date") ?? ""),
      })
      .eq("id", eventId);

    if (error) return { error: error.message };
    revalidatePath(`/boats/${boatId}/bookings`);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteBoatEvent(boatId: string, eventId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("boat_events").delete().eq("id", eventId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/bookings`);
}
