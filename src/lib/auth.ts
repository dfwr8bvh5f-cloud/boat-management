import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/locale";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { Profile } from "@/lib/types/database";

// Cached per-request: the root layout and the page it wraps (and, via
// getBoatContext, the boat layout and its page) each call this independently
// for the same logged-in user - caching avoids repeating the auth + profile
// round trip several times over for one navigation.
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

// Shared management-only gate for server actions - was duplicated with
// slightly different shapes (some took an already-fetched role, some
// returned the profile and some didn't) across boats/budget/reports/
// technicians/users actions. The error message key is still per-caller
// (they were never actually all the same wording), just no longer the
// role-check + fetch logic itself.
export async function requireManagement(errorKey: TranslationKey = "error_management_only_action"): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t(errorKey));
  }
  return profile;
}
