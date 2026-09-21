"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireManagement } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/locale";
import type { MichaliPeriodReportSnapshot } from "@/lib/types/database";

// Unlike issueFinancialReport/issueTechnicalReport (management-only authors,
// see src/lib/actions/reports.ts), this report is meant to be produced by
// the boat's own crew - the captain is the one filling in fuel/provisions/
// etc. - so any crew member on this boat (not just management) may save one.
// See 0103_michali_period_reports.sql for the matching RLS insert policy.
export async function saveMichaliPeriodReport(
  boatId: string,
  periodStart: string | null,
  periodEnd: string | null,
  snapshot: MichaliPeriodReportSnapshot
) {
  const profile = await requireProfile();
  if (profile.role !== "management" && profile.boat_id !== boatId) {
    const { t } = await getTranslator();
    throw new Error(t("error_not_authorized"));
  }
  const supabase = await createClient();

  const { error } = await supabase.from("michali_period_reports").insert({
    boat_id: boatId,
    period_start: periodStart,
    period_end: periodEnd,
    snapshot,
    created_by: profile.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/finance/periodic-reports`);
}

export async function deleteMichaliPeriodReport(boatId: string, reportId: string) {
  await requireManagement("error_management_only_reports");
  const supabase = await createClient();

  const { error } = await supabase.from("michali_period_reports").delete().eq("id", reportId);
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/finance/periodic-reports`);
}
