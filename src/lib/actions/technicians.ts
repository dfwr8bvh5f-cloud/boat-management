"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";

export async function createTechnician(formData: FormData) {
  const profile = await requireManagement();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    const { t } = await getTranslator();
    throw new Error(t("error_name_required"));
  }

  const { error } = await supabase.from("technicians").insert({
    name,
    contact_name: emptyToNull(formData.get("contact_name")),
    contact: emptyToNull(formData.get("contact")),
    phone: emptyToNull(formData.get("phone")),
    notes: emptyToNull(formData.get("notes")),
    created_by: profile.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/technicians");
}

export async function updateTechnician(technicianId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    const { t } = await getTranslator();
    throw new Error(t("error_name_required"));
  }

  const { error } = await supabase
    .from("technicians")
    .update({
      name,
      contact_name: emptyToNull(formData.get("contact_name")),
      contact: emptyToNull(formData.get("contact")),
      phone: emptyToNull(formData.get("phone")),
      notes: emptyToNull(formData.get("notes")),
    })
    .eq("id", technicianId);

  if (error) throw new Error(error.message);
  revalidatePath("/technicians");
}

export async function deleteTechnician(technicianId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { error } = await supabase.from("technicians").delete().eq("id", technicianId);
  if (error) throw new Error(error.message);
  revalidatePath("/technicians");
}
