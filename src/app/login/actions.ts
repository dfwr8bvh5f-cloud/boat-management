"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendPushToEmails } from "@/lib/push";
import { translate } from "@/lib/i18n/translate";
import type { UserRole } from "@/lib/types/database";

export type LoginState = { error: string | null };

const ROLE_LABEL_KEYS = {
  management: "role_management_label",
  captain: "role_captain_label",
  owner: "role_owner_label",
} as const;
const LOGIN_NOTIFY_EMAILS = ["info@medyachtings.com"];

// redirectTo comes from a query param the user controls (/login?redirectTo=...)
// - only a same-origin relative path is safe to hand to redirect(). An
// absolute or protocol-relative ("//evil.com") value would silently bounce
// a just-authenticated user off this trusted domain to an attacker's page.
function safeRedirectPath(path: string): string {
  if (path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")) return path;
  return "/";
}

// Push failures shouldn't block login - best-effort only.
async function notifyLogin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  try {
    const { data: profile } = await supabase.from("profiles").select("full_name, role, email").eq("id", userId).single();
    if (!profile) return;
    if (profile.email && LOGIN_NOTIFY_EMAILS.some((e) => e.toLowerCase() === profile.email!.toLowerCase())) return;
    await sendPushToEmails(LOGIN_NOTIFY_EMAILS, (locale) => ({
      title: translate(locale, "push_login_title"),
      body: translate(locale, "push_login_body", {
        name: profile.full_name ?? translate(locale, "user_fallback"),
        role: translate(locale, ROLE_LABEL_KEYS[profile.role as UserRole] ?? ROLE_LABEL_KEYS.management),
      }),
      url: "/",
    }));
  } catch (e) {
    // Push failures shouldn't block login, but a silent failure here is
    // otherwise invisible - log it so a real provider outage is still
    // discoverable, not just "VAPID not configured" going unnoticed forever.
    console.error("notifyLogin push failed:", e);
  }
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectPath(String(formData.get("redirectTo") ?? "/") || "/");

  if (!email || !password) {
    return { error: "יש להזין אימייל וסיסמה" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "אימייל או סיסמה שגויים" };
  }

  if (data.user) await notifyLogin(supabase, data.user.id);

  redirect(redirectTo);
}
