"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";
import type { Locale } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export async function setLocale(locale: Locale) {
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: "/" });
  revalidatePath("/", "layout");

  // Persisted on the profile (not just the cookie) so server-side push
  // notifications - sent from a cron job with no request/cookie context -
  // can still be translated into this user's chosen language.
  const profile = await getCurrentProfile();
  if (profile) {
    const supabase = await createClient();
    await supabase.from("profiles").update({ locale }).eq("id", profile.id);
  }
}
