"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type { UserRole } from "@/lib/types/database";

async function assertManagement() {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    throw new Error("פעולה זו זמינה לתפקיד ניהול בלבד");
  }
  return profile;
}

export async function createUserAccount(formData: FormData) {
  await assertManagement();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "owner") as UserRole;
  const boatId = emptyToNull(formData.get("boat_id"));

  if (!email || !password) {
    throw new Error("יש להזין אימייל וסיסמה זמנית");
  }
  if (role !== "management" && !boatId) {
    throw new Error("יש לשייך סירה לתפקיד קפטן/בעלים");
  }
  if (password.length < 8) {
    throw new Error("הסיסמה חייבת להכיל לפחות 8 תווים");
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

  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

export async function updateUserAccount(userId: string, formData: FormData) {
  await assertManagement();

  const role = String(formData.get("role") ?? "owner") as UserRole;
  const boatId = emptyToNull(formData.get("boat_id"));

  if (role !== "management" && !boatId) {
    throw new Error("יש לשייך סירה לתפקיד קפטן/בעלים");
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

export async function deleteUserAccount(userId: string) {
  await assertManagement();

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}
