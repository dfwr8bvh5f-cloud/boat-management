"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/locale";

export async function uploadCompanyLogo(formData: FormData) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_not_authorized"));
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    const { t } = await getTranslator();
    throw new Error(t("error_select_contract_file"));
  }

  const supabase = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `logo/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("company-assets")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { data: current } = await supabase.from("app_settings").select("company_logo_path").eq("id", true).single();
  const oldPath = current?.company_logo_path;

  const { error } = await supabase.from("app_settings").update({ company_logo_path: storagePath }).eq("id", true);
  if (error) throw new Error(error.message);

  if (oldPath) await supabase.storage.from("company-assets").remove([oldPath]);

  revalidatePath("/users");
  revalidatePath("/boats", "layout");
}

export async function removeCompanyLogo() {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_not_authorized"));
  }

  const supabase = await createClient();
  const { data: current } = await supabase.from("app_settings").select("company_logo_path").eq("id", true).single();

  const { error } = await supabase
    .from("app_settings")
    .update({ company_logo_path: null, company_logo_position_x: 50, company_logo_position_y: 50 })
    .eq("id", true);
  if (error) throw new Error(error.message);

  if (current?.company_logo_path) await supabase.storage.from("company-assets").remove([current.company_logo_path]);

  revalidatePath("/users");
  revalidatePath("/boats", "layout");
}

export async function updateCompanyLogoPosition(x: number, y: number) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_not_authorized"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ company_logo_position_x: x, company_logo_position_y: y })
    .eq("id", true);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
  revalidatePath("/boats", "layout");
}
