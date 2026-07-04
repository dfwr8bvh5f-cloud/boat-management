"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendPushToManagementExcept } from "@/lib/push";

export type LoginState = { error: string | null };

const ROLE_LABELS: Record<string, string> = { management: "חברת ניהול", captain: "קפטן / איש צוות", owner: "בעלים" };

// Push failures shouldn't block login - best-effort only.
async function notifyLogin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  try {
    const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", userId).single();
    if (!profile) return;
    await sendPushToManagementExcept(userId, {
      title: "כניסה למערכת",
      body: `${profile.full_name ?? "משתמש"} (${ROLE_LABELS[profile.role] ?? profile.role}) נכנס/ה למערכת`,
      url: "/",
    });
  } catch {
    // ignore - VAPID keys not configured, or push provider error
  }
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/") || "/";

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
