"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import { sendPushToEmails } from "@/lib/push";

const WEEKLY_REPORT_NOTIFY_EMAILS = ["tech@medyachtings.com", "tsafrir@medyachtings.com"];

// Push failures shouldn't block the report save - best-effort only.
async function notifyWeeklyReportSubmitted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  weekOf: string
) {
  try {
    const { data: boat } = await supabase.from("boats").select("name").eq("id", boatId).single();
    await sendPushToEmails(WEEKLY_REPORT_NOTIFY_EMAILS, {
      title: "דוח שבועי הוגש",
      body: `${boat?.name ?? ""} · ${weekOf}`,
      url: `/boats/${boatId}/maintenance/reports`,
    });
  } catch (e) {
    console.error("weekly report push notification failed:", e);
  }
}

export async function upsertWeeklyEngineReport(
  boatId: string,
  weekOf: string,
  machineSpecIds: string[],
  formData: FormData
) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: report, error } = await supabase
    .from("weekly_engine_reports")
    .upsert(
      {
        boat_id: boatId,
        week_of: weekOf,
        fuel_status: emptyToNull(formData.get("fuel_status")),
        notes: emptyToNull(formData.get("notes")),
        submitted_by: profile.id,
      },
      { onConflict: "boat_id,week_of" }
    )
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const entries = machineSpecIds
    .map((specId) => ({
      report_id: report.id,
      technical_spec_id: specId,
      hours: numberOrNull(formData.get(`hours_${specId}`)),
    }))
    .filter((e) => e.hours != null);

  if (entries.length > 0) {
    const { error: entriesError } = await supabase
      .from("weekly_engine_report_entries")
      .upsert(entries, { onConflict: "report_id,technical_spec_id" });
    if (entriesError) throw new Error(entriesError.message);
  }

  revalidatePath(`/boats/${boatId}/maintenance/reports`);
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
  revalidatePath(`/boats/${boatId}`);

  await notifyWeeklyReportSubmitted(supabase, boatId, weekOf);
}

export async function deleteWeeklyEngineReport(boatId: string, reportId: string) {
  const supabase = await createClient();

  // weekly_engine_report_entries references this row with on delete cascade,
  // so its entries are removed automatically.
  const { error } = await supabase.from("weekly_engine_reports").delete().eq("id", reportId);
  if (error) throw new Error(error.message);

  revalidatePath(`/boats/${boatId}/maintenance/reports`);
  revalidatePath(`/boats/${boatId}/maintenance/specs`);
  revalidatePath(`/boats/${boatId}`);
}
