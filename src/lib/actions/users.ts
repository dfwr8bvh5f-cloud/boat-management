"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";
import type { UserRole } from "@/lib/types/database";

async function assertManagement() {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_action"));
  }
  return profile;
}

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
  await assertManagement();

  const role = String(formData.get("role") ?? "owner") as UserRole;
  const boatId = emptyToNull(formData.get("boat_id"));

  if (role !== "management" && !boatId) {
    const { t } = await getTranslator();
    throw new Error(t("error_boat_required_for_role"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: emptyToNull(formData.get("full_name")),
      role,
      boat_id: role === "management" ? null : boatId,
    })
    .eq("id", userId);

  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

export async function resetUserPassword(userId: string, formData: FormData) {
  await assertManagement();

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
  await assertManagement();

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}
