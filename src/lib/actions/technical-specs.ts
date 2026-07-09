"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type { ApprovalStatus, TechnicalSpecCategory } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";

export async function createTechnicalSpec(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    const { t } = await getTranslator();
    throw new Error(t("error_item_name_required"));
  }

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { error } = await supabase.from("technical_specs").insert({
    boat_id: boatId,
    category: (String(formData.get("category") ?? "other") as TechnicalSpecCategory),
    name,
    model: emptyToNull(formData.get("model")),
    serial_number: emptyToNull(formData.get("serial_number")),
    next_service_date: emptyToNull(formData.get("next_service_date")),
    details: emptyToNull(formData.get("details")),
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
}

export async function updateTechnicalSpec(boatId: string, specId: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("technical_specs")
    .update({
      category: (String(formData.get("category") ?? "other") as TechnicalSpecCategory),
      name: String(formData.get("name") ?? "").trim(),
      model: emptyToNull(formData.get("model")),
      serial_number: emptyToNull(formData.get("serial_number")),
      next_service_date: emptyToNull(formData.get("next_service_date")),
      details: emptyToNull(formData.get("details")),
    })
    .eq("id", specId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
}

export async function deleteTechnicalSpec(boatId: string, specId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("technical_specs").delete().eq("id", specId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
}

export async function approveTechnicalSpec(boatId: string, specId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("technical_specs")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", specId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
}
