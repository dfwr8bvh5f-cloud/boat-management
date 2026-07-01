import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { Boat, Profile } from "@/lib/types/database";

export interface BoatContext {
  profile: Profile;
  boat: Boat;
  canEdit: boolean;
}

// Cached per-request: layout + page both call this for the same boatId
// without issuing the query twice.
export const getBoatContext = cache(async (boatId: string): Promise<BoatContext> => {
  const profile = await requireProfile();
  const supabase = await createClient();

  // RLS already scopes this to boats the user is allowed to see; a captain
  // or owner requesting someone else's boat id simply gets no row back.
  const { data: boat } = await supabase.from("boats").select("*").eq("id", boatId).single();
  if (!boat) notFound();

  const canEdit =
    profile.role === "management" || (profile.role === "captain" && profile.boat_id === boat.id);

  return { profile, boat, canEdit };
});
