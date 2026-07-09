"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";

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
}
