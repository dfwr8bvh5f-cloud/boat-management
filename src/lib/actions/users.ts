"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, requireManagement } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";
import type { UserRole } from "@/lib/types/database";

// Returns a result object instead of throwing so the real message always
// reaches the client - Next.js redacts thrown Server Action error messages
// in production builds, which was making every failure here show up as an
// opaque "Server Components render" error with no way to diagnose it.
export async function createUserAccount(formData: FormData): Promise<{ error: string | null }> {
  try {
    const profile = await requireProfile();
    const { t } = await getTranslator();
    if (profile.role !== "management") {
      return { error: t("error_management_only_action") };
    }

    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const fullName = String(formData.get("full_name") ?? "").trim();
    const role = String(formData.get("role") ?? "owner") as UserRole;
    const boatId = emptyToNull(formData.get("boat_id"));

    if (!email || !password) {
      return { error: t("error_email_password_required") };
    }
    if (role !== "management" && !boatId) {
      return { error: t("error_boat_required_for_role") };
    }
    if (password.length < 8) {
      return { error: t("error_password_min_length") };
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || email,
        role,
        boat_id: role === "management" ? null : boatId,
      },
    });

    if (error) return { error: error.message };

    revalidatePath("/users");
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateUserAccount(userId: string, formData: FormData) {
  await requireManagement();
  const { t } = await getTranslator();

  const role = String(formData.get("role") ?? "owner") as UserRole;
  const boatId = emptyToNull(formData.get("boat_id"));
  const email = String(formData.get("email") ?? "").trim();

  if (role !== "management" && !boatId) {
    throw new Error(t("error_boat_required_for_role"));
  }
  if (!email) {
    throw new Error(t("error_email_required"));
  }

  const supabase = await createClient();

  // Email lives on auth.users, not profiles - the profiles.email column is
  // just a copy made once at creation time (via the on_auth_user_created
  // trigger), so changing it here has to update both, in this order, so a
  // rejected auth-side change (e.g. a duplicate email) never leaves the
  // profile row out of sync with the real login email. Only actually called
  // when the email changed, since every plain name/role/boat edit submits
  // the same email back unchanged.
  const { data: current } = await supabase.from("profiles").select("email").eq("id", userId).single();
  if (current?.email !== email) {
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.updateUserById(userId, { email });
    if (authError) throw new Error(authError.message);
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: emptyToNull(formData.get("full_name")),
      email,
      role,
      boat_id: role === "management" ? null : boatId,
    })
    .eq("id", userId);

  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

export async function resetUserPassword(userId: string, formData: FormData) {
  await requireManagement();

  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    const { t } = await getTranslator();
    throw new Error(t("error_password_min_length"));
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
}

export async function deleteUserAccount(userId: string) {
  await requireManagement();

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}
