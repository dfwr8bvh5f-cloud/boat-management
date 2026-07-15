"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import type {
  ApprovalStatus,
  IssueArea,
  IssueAttachmentKind,
  IssueOpStatus,
} from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/translate";
import { sendPushToEmails } from "@/lib/push";

const ISSUE_APPROVAL_EMAILS = ["tech@medyachtings.com", "tsafrir@medyachtings.com"];

// Push failures shouldn't block issue creation - best-effort only.
async function notifyIssuePending(supabase: Awaited<ReturnType<typeof createClient>>, boatId: string, title: string) {
  try {
    const { data: boat } = await supabase.from("boats").select("name").eq("id", boatId).single();
    await sendPushToEmails(ISSUE_APPROVAL_EMAILS, (locale) => ({
      title: translate(locale, "push_issue_pending_title"),
      body: translate(locale, "push_issue_pending_body", { boat: boat?.name ?? "", title }),
      url: `/boats/${boatId}/maintenance/issues`,
    }));
  } catch (e) {
    console.error("issue push notification failed:", e);
  }
}

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

// Multiple photos/quotes per issue go into `issue_attachments`, one row per
// file - the legacy singular photo_path/quote_path columns on `issues` stay
// untouched so older issues keep displaying from them.
async function insertAttachments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  issueId: string,
  formData: FormData,
  fieldName: "photos" | "quotes",
  kind: IssueAttachmentKind,
  createdBy: string | null
) {
  const files = formData.getAll(fieldName).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return;

  const paths = await Promise.all(files.map((file) => uploadAttachment(supabase, boatId, file)));
  const { error } = await supabase
    .from("issue_attachments")
    .insert(paths.map((file_path) => ({ issue_id: issueId, boat_id: boatId, kind, file_path, created_by: createdBy })));

  if (error) {
    await supabase.storage.from("issue-attachments").remove(paths);
    throw new Error(error.message);
  }
}

export async function createIssue(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { data: inserted, error } = await supabase
    .from("issues")
    .insert({
      boat_id: boatId,
      title: String(formData.get("title") ?? "").trim(),
      classification: String(formData.get("classification") ?? "").trim(),
      is_warranty: formData.get("is_warranty") === "on",
      issue_date: emptyToNull(formData.get("issue_date")),
      area: (String(formData.get("area") ?? "technical") as IssueArea),
      location: emptyToNull(formData.get("location")),
      supplier: emptyToNull(formData.get("supplier")),
      supplier_labour: emptyToNull(formData.get("supplier_labour")),
      assigned_to: emptyToNull(formData.get("assigned_to")),
      notes: emptyToNull(formData.get("notes")),
      status,
      created_by: profile.id,
      ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await insertAttachments(supabase, boatId, inserted.id, formData, "photos", "photo", profile.id);
  await insertAttachments(supabase, boatId, inserted.id, formData, "quotes", "quote", profile.id);

  if (status === "pending") {
    await notifyIssuePending(supabase, boatId, String(formData.get("title") ?? "").trim());
  }

  revalidatePath(`/boats/${boatId}/maintenance/issues`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
  revalidatePath("/approvals");
}

export async function updateIssue(boatId: string, issueId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase
    .from("issues")
    .update({
      title: String(formData.get("title") ?? "").trim(),
      classification: String(formData.get("classification") ?? "").trim(),
      is_warranty: formData.get("is_warranty") === "on",
      issue_date: emptyToNull(formData.get("issue_date")),
      area: (String(formData.get("area") ?? "technical") as IssueArea),
      location: emptyToNull(formData.get("location")),
      supplier: emptyToNull(formData.get("supplier")),
      supplier_labour: emptyToNull(formData.get("supplier_labour")),
      assigned_to: emptyToNull(formData.get("assigned_to")),
      notes: emptyToNull(formData.get("notes")),
    })
    .eq("id", issueId);

  if (error) throw new Error(error.message);

  await insertAttachments(supabase, boatId, issueId, formData, "photos", "photo", profile.id);
  await insertAttachments(supabase, boatId, issueId, formData, "quotes", "quote", profile.id);

  revalidatePath(`/boats/${boatId}/maintenance/issues`);
}

export async function removeIssuePhoto(boatId: string, issueId: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase.from("issues").select("photo_path").eq("id", issueId).single();
  const { error } = await supabase.from("issues").update({ photo_path: null }).eq("id", issueId);
  if (error) throw new Error(error.message);

  if (existing?.photo_path) await supabase.storage.from("issue-attachments").remove([existing.photo_path]);
  revalidatePath(`/boats/${boatId}/maintenance/issues`);
}

export async function removeIssueQuote(boatId: string, issueId: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase.from("issues").select("quote_path").eq("id", issueId).single();
  const { error } = await supabase.from("issues").update({ quote_path: null }).eq("id", issueId);
  if (error) throw new Error(error.message);

  if (existing?.quote_path) await supabase.storage.from("issue-attachments").remove([existing.quote_path]);
  revalidatePath(`/boats/${boatId}/maintenance/issues`);
}

export async function removeIssueAttachment(boatId: string, attachmentId: string, filePath: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("issue_attachments").delete().eq("id", attachmentId);
  if (error) throw new Error(error.message);

  await supabase.storage.from("issue-attachments").remove([filePath]);
  revalidatePath(`/boats/${boatId}/maintenance/issues`);
}

export async function deleteIssue(
  boatId: string,
  issueId: string,
  photoPath: string | null,
  quotePath: string | null
) {
  const supabase = await createClient();

  const { data: attachments } = await supabase.from("issue_attachments").select("file_path").eq("issue_id", issueId);

  const { error } = await supabase.from("issues").delete().eq("id", issueId);
  if (error) throw new Error(error.message);

  const toRemove = [photoPath, quotePath, ...(attachments ?? []).map((a) => a.file_path)].filter(
    (p): p is string => Boolean(p)
  );
  if (toRemove.length) await supabase.storage.from("issue-attachments").remove(toRemove);
  revalidatePath(`/boats/${boatId}/maintenance/issues`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
  revalidatePath("/approvals");
}

export async function setIssueOpStatus(boatId: string, issueId: string, newStatus: IssueOpStatus) {
  const supabase = await createClient();

  const { error } = await supabase.from("issues").update({ op_status: newStatus }).eq("id", issueId);

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
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
  revalidatePath("/approvals");
}
