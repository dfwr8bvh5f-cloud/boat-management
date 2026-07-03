"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import type { ApprovalStatus, PaymentMethod } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";

async function uploadStaffFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  file: File
): Promise<string> {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from("staff-files")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return storagePath;
}

export async function createStaff(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const photoFile = formData.get("photo");
  const resumeFile = formData.get("resume");
  const photoPath =
    photoFile instanceof File && photoFile.size > 0 ? await uploadStaffFile(supabase, boatId, photoFile) : null;
  const resumePath =
    resumeFile instanceof File && resumeFile.size > 0 ? await uploadStaffFile(supabase, boatId, resumeFile) : null;

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
  const paymentMethod = emptyToNull(formData.get("payment_method"));

  const { error } = await supabase.from("staff").insert({
    boat_id: boatId,
    name: String(formData.get("name") ?? "").trim(),
    position: emptyToNull(formData.get("position")),
    date_of_birth: emptyToNull(formData.get("date_of_birth")),
    nationality: emptyToNull(formData.get("nationality")),
    phone: emptyToNull(formData.get("phone")),
    start_date: String(formData.get("start_date") ?? new Date().toISOString().slice(0, 10)),
    salary: numberOrNull(formData.get("salary")),
    payment_method: paymentMethod as PaymentMethod | null,
    resume_path: resumePath,
    photo_path: photoPath,
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) {
    const toRemove = [photoPath, resumePath].filter((p): p is string => Boolean(p));
    if (toRemove.length) await supabase.storage.from("staff-files").remove(toRemove);
    throw new Error(error.message);
  }

  revalidatePath(`/boats/${boatId}/staff`);
}

export async function deleteStaff(boatId: string, staffId: string, photoPath: string | null, resumePath: string | null) {
  const supabase = await createClient();

  const { error } = await supabase.from("staff").delete().eq("id", staffId);
  if (error) throw new Error(error.message);

  const toRemove = [photoPath, resumePath].filter((p): p is string => Boolean(p));
  if (toRemove.length) await supabase.storage.from("staff-files").remove(toRemove);
  revalidatePath(`/boats/${boatId}/staff`);
}

export async function approveStaff(boatId: string, staffId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", staffId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/staff`);
}
