"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireBoatAccess } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type { ApprovalStatus, TechnicalSpecCategory } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/translate";
import { sendPushToEmails } from "@/lib/push";

// Same recipients as issue approvals (lib/actions/issues.ts).
const SPEC_APPROVAL_EMAILS = ["tech@medyachtings.com", "tsafrir@medyachtings.com"];

// Best-effort - a push failure must never block saving the spec.
async function notifySpecPending(boatName: string, boatId: string, specName: string) {
  try {
    await sendPushToEmails(SPEC_APPROVAL_EMAILS, (locale) => ({
      title: translate(locale, "push_spec_pending_title"),
      body: translate(locale, "push_spec_pending_body", { boat: boatName, title: specName }),
      url: `/boats/${boatId}/maintenance/specs`,
    }));
  } catch (e) {
    console.error("technical spec push notification failed:", e);
  }
}

// Management-only: re-sends the pending-approval push for every spec on the
// boat still waiting (used to catch up on specs added before pushes existed).
export async function remindPendingSpecs(boatId: string): Promise<{ sent: number } | { error: string }> {
  const profile = await requireProfile();
  const { t } = await getTranslator();
  if (profile.role !== "management") return { error: t("error_management_only_approve") };
  const supabase = await createClient();
  const [{ data: boat }, { data: pending, error }] = await Promise.all([
    supabase.from("boats").select("name").eq("id", boatId).single(),
    supabase.from("technical_specs").select("name").eq("boat_id", boatId).eq("status", "pending"),
  ]);
  if (error) {
    console.error("remindPendingSpecs query failed:", error.message);
    return { error: t("spec_remind_failed") };
  }
  for (const spec of pending ?? []) await notifySpecPending(boat?.name ?? "", boatId, spec.name);
  return { sent: pending?.length ?? 0 };
}

async function uploadSpecPhoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  file: File
): Promise<string> {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from("technical-spec-photos")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return storagePath;
}

export async function createTechnicalSpec(boatId: string, formData: FormData) {
  const profile = await requireBoatAccess(boatId);
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    const { t } = await getTranslator();
    throw new Error(t("error_item_name_required"));
  }

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
  const photoFile = formData.get("photo");
  const photoPath =
    photoFile instanceof File && photoFile.size > 0 ? await uploadSpecPhoto(supabase, boatId, photoFile) : null;

  const { error } = await supabase.from("technical_specs").insert({
    boat_id: boatId,
    category: (String(formData.get("category") ?? "other") as TechnicalSpecCategory),
    name,
    model: emptyToNull(formData.get("model")),
    serial_number: emptyToNull(formData.get("serial_number")),
    details: emptyToNull(formData.get("details")),
    photo_path: photoPath,
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) {
    if (photoPath) await supabase.storage.from("technical-spec-photos").remove([photoPath]);
    throw new Error(error.message);
  }
  if (status === "pending") {
    const { data: boat } = await supabase.from("boats").select("name").eq("id", boatId).single();
    await notifySpecPending(boat?.name ?? "", boatId, name);
  }
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
}

export async function updateTechnicalSpec(boatId: string, specId: string, formData: FormData) {
  await requireBoatAccess(boatId);
  const supabase = await createClient();

  const photoFile = formData.get("photo");
  const photoPath =
    photoFile instanceof File && photoFile.size > 0 ? await uploadSpecPhoto(supabase, boatId, photoFile) : undefined;

  const { error } = await supabase
    .from("technical_specs")
    .update({
      category: (String(formData.get("category") ?? "other") as TechnicalSpecCategory),
      name: String(formData.get("name") ?? "").trim(),
      model: emptyToNull(formData.get("model")),
      serial_number: emptyToNull(formData.get("serial_number")),
      details: emptyToNull(formData.get("details")),
      ...(photoPath ? { photo_path: photoPath } : {}),
    })
    .eq("id", specId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
}

export async function removeTechnicalSpecPhoto(boatId: string, specId: string) {
  await requireBoatAccess(boatId);
  const supabase = await createClient();

  const { data: existing } = await supabase.from("technical_specs").select("photo_path").eq("id", specId).single();
  const { error } = await supabase.from("technical_specs").update({ photo_path: null }).eq("id", specId);
  if (error) throw new Error(error.message);

  if (existing?.photo_path) await supabase.storage.from("technical-spec-photos").remove([existing.photo_path]);
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
}

export async function deleteTechnicalSpec(boatId: string, specId: string, photoPath: string | null) {
  await requireBoatAccess(boatId);
  const supabase = await createClient();
  const { error } = await supabase.from("technical_specs").delete().eq("id", specId);
  if (error) throw new Error(error.message);
  if (photoPath) await supabase.storage.from("technical-spec-photos").remove([photoPath]);
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
