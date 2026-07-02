"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import type { ApprovalStatus, IssueArea, IssueClassification, IssueOpStatus, PaymentMethod } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";

const OP_STATUS_CYCLE: IssueOpStatus[] = ["not_started", "pending", "in_progress", "completed", "cancelled"];

async function uploadAttachment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  file: File
): Promise<string> {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from("issue-attachments")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return storagePath;
}

export async function createIssue(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const photoFile = formData.get("photo");
  const quoteFile = formData.get("quote");
  const photoPath =
    photoFile instanceof File && photoFile.size > 0 ? await uploadAttachment(supabase, boatId, photoFile) : null;
  const quotePath =
    quoteFile instanceof File && quoteFile.size > 0 ? await uploadAttachment(supabase, boatId, quoteFile) : null;

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
  const paymentMethod = emptyToNull(formData.get("payment_method"));

  const { error } = await supabase.from("issues").insert({
    boat_id: boatId,
    title: String(formData.get("title") ?? "").trim(),
    classification: (String(formData.get("classification") ?? "repair") as IssueClassification),
    area: (String(formData.get("area") ?? "technical") as IssueArea),
    location: emptyToNull(formData.get("location")),
    supplier: emptyToNull(formData.get("supplier")),
    estimated_cost: numberOrNull(formData.get("estimated_cost")),
    payment_method: paymentMethod as PaymentMethod | null,
    due_date: emptyToNull(formData.get("due_date")),
    assigned_to: emptyToNull(formData.get("assigned_to")),
    notes: emptyToNull(formData.get("notes")),
    photo_path: photoPath,
    quote_path: quotePath,
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) {
    const toRemove = [photoPath, quotePath].filter((p): p is string => Boolean(p));
    if (toRemove.length) await supabase.storage.from("issue-attachments").remove(toRemove);
    throw new Error(error.message);
  }

  revalidatePath(`/boats/${boatId}/maintenance/issues`);
  revalidatePath(`/boats/${boatId}`);
}

export async function updateIssue(boatId: string, issueId: string, formData: FormData) {
  const supabase = await createClient();

  const photoFile = formData.get("photo");
  const quoteFile = formData.get("quote");
  const photoPath =
    photoFile instanceof File && photoFile.size > 0 ? await uploadAttachment(supabase, boatId, photoFile) : undefined;
  const quotePath =
    quoteFile instanceof File && quoteFile.size > 0 ? await uploadAttachment(supabase, boatId, quoteFile) : undefined;
  const paymentMethod = emptyToNull(formData.get("payment_method"));

  const { error } = await supabase
    .from("issues")
    .update({
      title: String(formData.get("title") ?? "").trim(),
      classification: (String(formData.get("classification") ?? "repair") as IssueClassification),
      area: (String(formData.get("area") ?? "technical") as IssueArea),
      location: emptyToNull(formData.get("location")),
      supplier: emptyToNull(formData.get("supplier")),
      estimated_cost: numberOrNull(formData.get("estimated_cost")),
      payment_method: paymentMethod as PaymentMethod | null,
      due_date: emptyToNull(formData.get("due_date")),
      assigned_to: emptyToNull(formData.get("assigned_to")),
      notes: emptyToNull(formData.get("notes")),
      ...(photoPath ? { photo_path: photoPath } : {}),
      ...(quotePath ? { quote_path: quotePath } : {}),
    })
    .eq("id", issueId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/issues`);
}

export async function deleteIssue(
  boatId: string,
  issueId: string,
  photoPath: string | null,
  quotePath: string | null
) {
  const supabase = await createClient();

  const { error } = await supabase.from("issues").delete().eq("id", issueId);
  if (error) throw new Error(error.message);

  const toRemove = [photoPath, quotePath].filter((p): p is string => Boolean(p));
  if (toRemove.length) await supabase.storage.from("issue-attachments").remove(toRemove);
  revalidatePath(`/boats/${boatId}/maintenance/issues`);
}

export async function cycleIssueOpStatus(boatId: string, issueId: string, currentStatus: IssueOpStatus) {
  const supabase = await createClient();
  const nextIndex = (OP_STATUS_CYCLE.indexOf(currentStatus) + 1) % OP_STATUS_CYCLE.length;

  const { error } = await supabase
    .from("issues")
    .update({ op_status: OP_STATUS_CYCLE[nextIndex] })
    .eq("id", issueId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/issues`);
}

export async function approveIssue(boatId: string, issueId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("issues")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", issueId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/issues`);
}
