import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VERIFIED_USER_ID_HEADER } from "@/lib/supabase/auth-header";
import { getTranslator } from "@/lib/i18n/locale";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { Profile } from "@/lib/types/database";

// Cached per-request: the root layout and the page it wraps (and, via
// getBoatContext, the boat layout and its page) each call this independently
// for the same logged-in user - caching avoids repeating the auth + profile
// round trip several times over for one navigation.
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  // middleware.ts already called supabase.auth.getUser() for this exact
  // request (required there to refresh the session token) and stamped the
  // verified id onto a request header - reusing it here avoids a second
  // full network round-trip to Supabase's Auth server on every page render.
  // Falls back to calling getUser() directly if the header is ever missing
  // (e.g. a code path middleware's matcher doesn't cover) rather than
  // trusting an absent/empty value.
  const headerList = await headers();
  let userId: string | null = headerList.get(VERIFIED_USER_ID_HEADER) || null;

  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
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

// Shared boat-ownership gate for server actions that take a boatId - the
// same inline check already used correctly in the 4 upload-url helpers
// (createExpenseUploadUrl etc.), pulled out so every boat-scoped action can
// use it instead of trusting its boatId argument blindly. This is
// defense-in-depth on top of RLS, not a replacement for it: Supabase RLS is
// the real enforcement layer (unverifiable from this repo's committed
// migrations, since it's configured outside version control), and app code
// had zero independent check before this - a captain/owner's own session
// could call a boat-scoped action with a DIFFERENT boat's id and the
// application layer would not reject it on its own, leaving the outcome
// entirely dependent on RLS being correctly configured for every table and
// every operation (select/insert/update/delete) with no code-level backstop.
export async function requireBoatAccess(boatId: string): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "management" && profile.boat_id !== boatId) {
    const { t } = await getTranslator();
    throw new Error(t("error_not_authorized"));
  }
  return profile;
}
