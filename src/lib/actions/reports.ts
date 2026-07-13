"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/translate";
import { sendPushToAll } from "@/lib/push";
import { computeFinancialSnapshot } from "@/lib/report-data";
import { getExpenseCategories } from "@/lib/labels";
import type { TechnicalSnapshot } from "@/lib/types/database";

// Push failures shouldn't block report issuance - best-effort only.
async function notifyReportIssued(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  titleKey: "push_report_financial_title" | "push_report_technical_title",
  path: string
) {
  try {
    const { data: boat } = await supabase.from("boats").select("name").eq("id", boatId).single();
    await sendPushToAll((locale) => ({
      title: translate(locale, titleKey),
      body: translate(locale, "push_report_body", { boat: boat?.name ?? "" }),
      url: `/boats/${boatId}${path}`,
    }));
  } catch (e) {
    console.error("report push notification failed:", e);
  }
}

async function assertManagement() {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_reports"));
  }
  return profile;
}

export async function issueFinancialReport(boatId: string, from: string, to: string) {
  const profile = await assertManagement();
  const supabase = await createClient();

  const { data: boat } = await supabase.from("boats").select("boat_type, name").eq("id", boatId).single();
  const categories = getExpenseCategories(boat?.boat_type, boat?.name);
  const snapshot = await computeFinancialSnapshot(supabase, boatId, from, to, categories);

  const { error } = await supabase
    .from("reports")
    .insert({ boat_id: boatId, type: "financial", period_start: from, period_end: to, snapshot, issued_by: profile.id });
  if (error) throw new Error(error.message);

  await notifyReportIssued(supabase, boatId, "push_report_financial_title", "/finance/reports");
  revalidatePath(`/boats/${boatId}/finance/reports`);
}

export async function issueTechnicalReport(boatId: string, from: string, to: string) {
  const profile = await assertManagement();
  const supabase = await createClient();

  const [{ data: periodIssues }, { data: openIssues }, { data: documents }] = await Promise.all([
    supabase
      .from("issues")
      .select("title, op_status")
      .eq("boat_id", boatId)
      .gte("created_at", from)
      .lte("created_at", `${to}T23:59:59`),
    supabase.from("issues").select("id").eq("boat_id", boatId).not("op_status", "in", "(completed,cancelled)"),
    supabase.from("documents").select("name, doc_type, expiry_date").eq("boat_id", boatId).not("expiry_date", "is", null),
  ]);

  const today = new Date();
  const docAlerts = (documents ?? [])
    .filter((d) => {
      if (!d.expiry_date) return false;
      const days = (new Date(d.expiry_date).getTime() - today.getTime()) / 86_400_000;
      return days <= 30;
    })
    .map((d) => ({ name: d.name, docType: d.doc_type, expiryDate: d.expiry_date as string }));

  const snapshot: TechnicalSnapshot = {
    newIssues: periodIssues?.length ?? 0,
    resolvedThisMonth: (periodIssues ?? []).filter((i) => i.op_status === "completed").length,
    stillOpen: openIssues?.length ?? 0,
    issueList: (periodIssues ?? []).map((i) => ({ title: i.title, status: i.op_status })),
    docAlerts,
  };

  const { error } = await supabase
    .from("reports")
    .insert({ boat_id: boatId, type: "technical", period_start: from, period_end: to, snapshot, issued_by: profile.id });
  if (error) throw new Error(error.message);

  await notifyReportIssued(supabase, boatId, "push_report_technical_title", "/maintenance/reports");
  revalidatePath(`/boats/${boatId}/maintenance/reports`);
}

export async function deleteReport(boatId: string, reportId: string) {
  await assertManagement();
  const supabase = await createClient();
  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/finance/reports`);
  revalidatePath(`/boats/${boatId}/maintenance/reports`);
}
