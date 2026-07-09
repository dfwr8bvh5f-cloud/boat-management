"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";

export async function upsertWeeklyEngineReport(boatId: string, weekOf: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("weekly_engine_reports").upsert(
    {
      boat_id: boatId,
      week_of: weekOf,
      main_engine_hours: numberOrNull(formData.get("main_engine_hours")),
      generator_main_hours: numberOrNull(formData.get("generator_main_hours")),
      generator_secondary_hours: numberOrNull(formData.get("generator_secondary_hours")),
      watermaker_hours: numberOrNull(formData.get("watermaker_hours")),
      fuel_status: emptyToNull(formData.get("fuel_status")),
      submitted_by: profile.id,
    },
    { onConflict: "boat_id,week_of" }
  );

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/reports`);
  revalidatePath(`/boats/${boatId}`);
}
